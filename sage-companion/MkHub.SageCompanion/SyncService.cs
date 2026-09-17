using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using MkHub.SageCompanion.Hub;
using MkHub.SageCompanion.Sage;

namespace MkHub.SageCompanion
{
    public static class SyncService
    {
        const int MaxQueueItems = 50;
        const string SyncMutexName = "Global\\MkHubSageCompanionSync";

        public static string Run(AppConfig cfg)
        {
            if (cfg == null) throw new ArgumentNullException("cfg");
            bool owned = false;
            var mutex = new Mutex(false, SyncMutexName);
            try
            {
                try { owned = mutex.WaitOne(0); }
                catch (AbandonedMutexException) { owned = true; }
                if (!owned)
                    throw new InvalidOperationException("Another Sage Companion sync is already running.");
                if (HubClient.IsConfigured(cfg))
                    return RunHubQueue(cfg);
                return RunSampleSlip(cfg);
            }
            finally
            {
                if (owned)
                {
                    try { mutex.ReleaseMutex(); } catch { }
                }
                mutex.Close();
            }
        }

        public static string TestOpen(AppConfig cfg)
        {
            if (cfg == null) throw new ArgumentNullException("cfg");
            if (string.IsNullOrWhiteSpace(cfg.SaiPath) || !File.Exists(cfg.SaiPath))
                throw new InvalidOperationException("Company file not found: " + cfg.SaiPath);
            if (string.IsNullOrWhiteSpace(cfg.SageUser))
                throw new InvalidOperationException("Sage user is required.");

            string error;
            if (!SageSession.Open(cfg, out error))
                throw new InvalidOperationException(error);
            try
            {
                var name = SageSession.ResolveEmployeeName((cfg.EmployeeName ?? "").Trim());
                var itemCode = (cfg.Item ?? "").Trim();
                if (!string.IsNullOrWhiteSpace(itemCode) && !SageSession.ItemExists(itemCode))
                    throw new InvalidOperationException("Sage item not found: [" + itemCode + "].");
                var msg = "Opened Sage OK. Employee [" + name + "].";
                AppLog.Info(msg);
                return msg;
            }
            finally
            {
                SageSession.Close();
            }
        }

        public static string TestHub(AppConfig cfg)
        {
            if (!HubClient.IsConfigured(cfg))
                throw new InvalidOperationException("Set MKHub base URL and companion secret first.");
            var items = HubClient.GetQueue(cfg);
            var msg = "MKHub queue OK. " + items.Count + " Time Slip(s) waiting.";
            AppLog.Info(msg);
            return msg;
        }

        static string RunHubQueue(AppConfig cfg)
        {
            if (string.IsNullOrWhiteSpace(cfg.SaiPath) || !File.Exists(cfg.SaiPath))
                throw new InvalidOperationException("Company file not found: " + cfg.SaiPath);
            if (string.IsNullOrWhiteSpace(cfg.SageUser))
                throw new InvalidOperationException("Sage user is required.");

            AppLog.Info("Pulling MKHub Sage queue from " + cfg.HubBaseUrl);
            var items = HubClient.GetQueue(cfg);
            if (items.Count > MaxQueueItems)
                items = items.GetRange(0, MaxQueueItems);
            if (items.Count == 0)
            {
                var empty = "MKHub queue is empty — nothing to send to Sage.";
                AppLog.Info(empty);
                return empty;
            }

            var work = new List<PreparedSlip>();
            for (int i = 0; i < items.Count; i++)
                work.Add(Prepare(cfg, items[i]));

            AppLog.Info("Opening Sage once to check " + work.Count + " queue row(s).");
            string openError;
            if (!SageSession.Open(cfg, out openError))
                throw new InvalidOperationException(openError);
            var existing = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                var slipNos = new List<string>();
                for (int i = 0; i < work.Count; i++)
                {
                    if (!string.IsNullOrWhiteSpace(work[i].SlipNo))
                        slipNos.Add(work[i].SlipNo);
                }
                existing = SageSession.FindSlipRecIds(slipNos);
                for (int i = 0; i < work.Count; i++)
                {
                    var row = work[i];
                    if (!string.IsNullOrWhiteSpace(row.Error)) continue;
                    try
                    {
                        row.Employee = SageSession.ResolveEmployeeName(row.Employee);
                        string recId;
                        if (existing.TryGetValue(row.SlipNo, out recId))
                            row.ExistingRecId = recId;
                        else if (!SageSession.ItemExists(row.ItemCode))
                            row.Error = "Sage item not found: [" + row.ItemCode + "].";
                    }
                    catch (Exception ex)
                    {
                        row.Error = ex.Message;
                    }
                }
            }
            finally
            {
                SageSession.Close();
            }

            var sent = 0;
            var skipped = 0;
            var failed = 0;
            var toImport = new List<PreparedSlip>();
            for (int i = 0; i < work.Count; i++)
            {
                var row = work[i];
                if (!string.IsNullOrWhiteSpace(row.Error))
                {
                    failed++;
                    AppLog.Error("Queue item " + row.Item.attendance_id + ": " + row.Error);
                    if (!cfg.DryRun)
                    {
                        try { HubClient.Ack(cfg, row.Item.attendance_id, "error", null, row.Error); }
                        catch (Exception ackEx) { AppLog.Error("Ack failed: " + ackEx.Message); }
                    }
                    continue;
                }
                if (!string.IsNullOrEmpty(row.ExistingRecId))
                {
                    AppLog.Info("Slip " + row.SlipNo + " already in Sage (lId=" + row.ExistingRecId + ")");
                    if (!cfg.DryRun)
                    {
                        try { HubClient.Ack(cfg, row.Item.attendance_id, "sent", row.ExistingRecId, null); }
                        catch (Exception ackEx) { AppLog.Error("Ack failed: " + ackEx.Message); }
                    }
                    skipped++;
                    continue;
                }
                toImport.Add(row);
            }

            if (toImport.Count > 0)
            {
                var batch = new List<TimeslipRow>();
                for (int i = 0; i < toImport.Count; i++)
                {
                    var row = toImport[i];
                    batch.Add(new TimeslipRow
                    {
                        Employee = row.Employee,
                        SlipNo = row.SlipNo,
                        Date = row.Date,
                        Customer = row.Customer,
                        Item = row.ItemCode,
                        Hours = row.Hours
                    });
                }
                var impPath = Path.Combine(Path.GetTempPath(),
                    "mkhub-companion-batch-" + DateTime.Now.ToString("yyyyMMddHHmmss") + ".imp");
                ImpWriter.WriteBatch(impPath, batch);
                AppLog.Info("IMP batch (" + batch.Count + " Time Slip(s)) " + impPath
                    + Environment.NewLine + File.ReadAllText(impPath));

                if (cfg.DryRun)
                {
                    AppLog.Info("Dry run — one Sage import would write " + batch.Count
                        + " Time Slip(s) with a single login. Sage and Hub were not updated.");
                    sent = toImport.Count;
                }
                else
                {
                    if (string.IsNullOrWhiteSpace(cfg.ImportExe) || !File.Exists(cfg.ImportExe))
                        throw new InvalidOperationException("Sage_SA_import.exe not found: " + cfg.ImportExe);

                    var itemHint = toImport[0].ItemCode;
                    var customerHint = toImport[0].Customer;
                    AppLog.Info("Running Sage import once for " + toImport.Count + " Time Slip(s)...");
                    int code = ImportRunner.Run(cfg.ImportExe, impPath, cfg.SaiPath, itemHint, customerHint, cfg.SagePassword);
                    AppLog.Info("import exit code: " + code);

                    AppLog.Info("Re-opening Sage once to read " + toImport.Count + " Time Slip id(s).");
                    Dictionary<string, string> recIds = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    if (SageSession.Open(cfg, out openError))
                    {
                        try
                        {
                            var slipNos = new List<string>();
                            for (int i = 0; i < toImport.Count; i++)
                                slipNos.Add(toImport[i].SlipNo);
                            recIds = SageSession.FindSlipRecIds(slipNos);
                        }
                        finally
                        {
                            SageSession.Close();
                        }
                    }
                    else
                    {
                        AppLog.Error("Re-open after import failed: " + openError);
                    }

                    for (int i = 0; i < toImport.Count; i++)
                    {
                        var row = toImport[i];
                        string recId;
                        recIds.TryGetValue(row.SlipNo, out recId);
                        try
                        {
                            if (!string.IsNullOrEmpty(recId) || code == 0)
                            {
                                HubClient.Ack(cfg, row.Item.attendance_id, "sent", recId, null);
                                sent++;
                                AppLog.Info("Wrote Time Slip " + row.SlipNo
                                    + (string.IsNullOrEmpty(recId) ? "" : " (ttsrec.lId=" + recId + ")")
                                    + " and marked sent on MKHub.");
                            }
                            else
                            {
                                var err = "Sage import failed with exit code " + code + ".";
                                HubClient.Ack(cfg, row.Item.attendance_id, "error", null, err);
                                failed++;
                                AppLog.Error("Queue item " + row.Item.attendance_id + ": " + err);
                            }
                        }
                        catch (Exception ackEx)
                        {
                            failed++;
                            AppLog.Error("Ack failed for " + row.SlipNo + ": " + ackEx.Message);
                        }
                    }
                }
            }

            var summary = "Hub sync: " + sent + " posted, " + skipped + " already in Sage, " + failed + " failed"
                + (cfg.DryRun ? " (dry run — Sage and Hub were not updated)." : ".");
            AppLog.Info(summary);
            return summary;
        }

        static PreparedSlip Prepare(AppConfig cfg, HubQueueItem item)
        {
            var row = new PreparedSlip { Item = item };
            try
            {
                row.Employee = FirstNonEmpty(item.sage_employee_name, item.worker_name, cfg.EmployeeName);
                row.ItemCode = FirstNonEmpty(item.sage_item, cfg.Item, "101");
                row.Customer = FirstNonEmpty(item.sage_customer, cfg.Customer, "0 Customer");
                var hours = (item.hours_hhmmss ?? "").Trim();
                if (string.IsNullOrWhiteSpace(hours) && item.hours != null && Convert.ToString(item.hours) != "")
                    hours = ImpWriter.NormalizeHours(Convert.ToString(item.hours));
                if (string.IsNullOrWhiteSpace(hours) || hours == "00:00:00")
                    throw new InvalidOperationException("No hours to export for attendance " + item.attendance_id);
                row.Hours = hours;
                row.SlipNo = FirstNonEmpty(item.sage_source_key, ImpWriter.NewSlipNumber());
                if (row.SlipNo.Length > 20) row.SlipNo = row.SlipNo.Substring(0, 20);
                row.Date = FirstNonEmpty(item.work_date, DateTime.Now.ToString("MM-dd-yyyy"));
            }
            catch (Exception ex)
            {
                row.Error = ex.Message;
            }
            return row;
        }

        static string RunSampleSlip(AppConfig cfg)
        {
            if (string.IsNullOrWhiteSpace(cfg.SaiPath) || !File.Exists(cfg.SaiPath))
                throw new InvalidOperationException("Company file not found: " + cfg.SaiPath);
            if (string.IsNullOrWhiteSpace(cfg.SageUser))
                throw new InvalidOperationException("Sage user is required.");
            if (string.IsNullOrWhiteSpace(cfg.EmployeeName))
                throw new InvalidOperationException("Employee name is required.");

            var hours = ImpWriter.NormalizeHours(cfg.Hours);
            var slipNo = ImpWriter.NewSlipNumber();
            var date = DateTime.Now.ToString("MM-dd-yyyy");
            var employee = cfg.EmployeeName.Trim();

            AppLog.Info("Opening Sage: " + cfg.SaiPath);
            string openError;
            if (!SageSession.Open(cfg, out openError))
                throw new InvalidOperationException(openError);
            try
            {
                employee = SageSession.ResolveEmployeeName(employee);
                if (!SageSession.ItemExists((cfg.Item ?? "").Trim()))
                    throw new InvalidOperationException("Sage item not found: [" + (cfg.Item ?? "") + "].");
            }
            finally
            {
                SageSession.Close();
            }

            var impPath = Path.Combine(Path.GetTempPath(), "mkhub-companion-" + slipNo + ".imp");
            ImpWriter.WriteFile(impPath, employee, slipNo, date, cfg.Customer, cfg.Item, hours);
            AppLog.Info("IMP " + impPath + Environment.NewLine + File.ReadAllText(impPath));

            if (cfg.DryRun)
            {
                var msg = "Dry run — IMP written, Sage was not updated. Slip " + slipNo + ".";
                AppLog.Info(msg);
                return msg;
            }

            if (string.IsNullOrWhiteSpace(cfg.ImportExe) || !File.Exists(cfg.ImportExe))
                throw new InvalidOperationException("Sage_SA_import.exe not found: " + cfg.ImportExe);

            AppLog.Info("Running Sage import (this writes a Time Slip on the Development SAI)...");
            int code = ImportRunner.Run(cfg.ImportExe, impPath, cfg.SaiPath, cfg.Item, cfg.Customer, cfg.SagePassword);
            AppLog.Info("import exit code: " + code);

            string recId = null;
            if (SageSession.Open(cfg, out openError))
            {
                try { recId = SageSession.FindSlipRecId(slipNo); }
                finally { SageSession.Close(); }
            }
            else
            {
                AppLog.Error("Re-open after import failed: " + openError);
            }

            if (code != 0)
                throw new InvalidOperationException("Sage import failed with exit code " + code + ".");

            var ok = "Wrote Time Slip " + slipNo + (string.IsNullOrEmpty(recId) ? "" : " (ttsrec.lId=" + recId + ")");
            AppLog.Info(ok);
            return ok;
        }

        static string FirstNonEmpty(params string[] parts)
        {
            for (int i = 0; i < parts.Length; i++)
            {
                if (!string.IsNullOrWhiteSpace(parts[i]))
                    return parts[i].Trim();
            }
            return "";
        }

        class PreparedSlip
        {
            public HubQueueItem Item;
            public string Employee;
            public string ItemCode;
            public string Customer;
            public string Hours;
            public string SlipNo;
            public string Date;
            public string ExistingRecId;
            public string Error;
        }
    }
}
