using System;
using System.Collections.Generic;
using System.Data;
using System.Text;
using Simply.Domain.Utility;
using SimplySDK;
using SimplySDK.InventoryModule;
using SimplySDK.PayrollModule;
using SimplySDK.Support;

namespace MkHub.SageCompanion.Sage
{
    public static class SageSession
    {
        static readonly Dictionary<string, string> EmployeeCache =
            new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        static readonly Dictionary<string, bool> ItemCache =
            new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);

        public static bool Open(AppConfig cfg, out string error)
        {
            error = null;
            EmployeeCache.Clear();
            ItemCache.Clear();
            SDKInstanceManager.Instance.SetAlertImplementation(new QuietAlert());
            SDKInstanceManager.SDKResult result;
            bool opened = SDKInstanceManager.Instance.OpenDatabase(
                cfg.SaiPath,
                cfg.SageUser,
                cfg.SagePassword ?? "",
                true,
                "MKHub Companion",
                "MKHUB",
                1,
                out result);
            if (!opened)
            {
                error = "OpenDatabase failed: " + result;
                return false;
            }
            return true;
        }

        public static void Close()
        {
            EmployeeCache.Clear();
            ItemCache.Clear();
            try { SDKInstanceManager.Instance.CloseDatabase(); }
            catch { }
        }

        public static string ResolveEmployeeName(string wanted)
        {
            if (string.IsNullOrWhiteSpace(wanted))
                throw new InvalidOperationException("Employee name is empty.");
            string resolved;
            if (EmployeeCache.TryGetValue(wanted, out resolved))
                return resolved;
            EmployeeLedgerBase emp = SDKInstanceManager.Instance.OpenEmployeeLedger();
            try
            {
                if (emp.LoadByName(wanted))
                {
                    AppLog.Info("Employee ledger name: [" + emp.Name + "]");
                    EmployeeCache[wanted] = emp.Name;
                    return emp.Name;
                }
            }
            finally
            {
                SDKInstanceManager.Instance.CloseEmployeeLedger();
            }
            throw new InvalidOperationException(
                "Sage employee not found: [" + wanted + "]. The MKHub name must match the Sage employee ledger exactly.");
        }

        public static string FindSlipRecId(string slipNo)
        {
            var one = new List<string>();
            one.Add(slipNo);
            string recId;
            if (FindSlipRecIds(one).TryGetValue(slipNo ?? "", out recId))
                return recId;
            return null;
        }

        public static Dictionary<string, string> FindSlipRecIds(IList<string> slipNos)
        {
            var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            if (slipNos == null || slipNos.Count == 0) return map;
            var inList = new StringBuilder();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            for (int i = 0; i < slipNos.Count; i++)
            {
                var slip = (slipNos[i] ?? "").Trim();
                if (slip.Length == 0 || !seen.Add(slip)) continue;
                if (inList.Length > 0) inList.Append(',');
                inList.Append('\'').Append(EscapeSql(slip)).Append('\'');
            }
            if (inList.Length == 0) return map;
            var util = new SDKDatabaseUtility();
            string sql = "SELECT lId, sSource FROM ttsrec WHERE sSource IN (" + inList + ")";
            try
            {
                int n = util.RunSelectQuery(sql);
                if (n <= 0) return map;
                DataSet ds = util.GetDataSetFromLastSelectQuery();
                if (ds == null || ds.Tables.Count == 0) return map;
                foreach (DataRow row in ds.Tables[0].Rows)
                {
                    var source = row["sSource"] == null || row["sSource"] == DBNull.Value ? "" : row["sSource"].ToString();
                    var id = row["lId"] == null || row["lId"] == DBNull.Value ? "" : row["lId"].ToString();
                    if (source.Length > 0 && id.Length > 0)
                        map[source] = id;
                }
            }
            catch (Exception ex)
            {
                AppLog.Error("Slip lookup failed: " + ex.Message);
            }
            return map;
        }

        public static bool ItemExists(string code)
        {
            if (string.IsNullOrWhiteSpace(code)) return false;
            bool cached;
            if (ItemCache.TryGetValue(code, out cached))
                return cached;
            InventoryLedger inv = SDKInstanceManager.Instance.OpenInventoryLedger();
            try
            {
                if (inv.LoadByPartCode(code))
                {
                    AppLog.Info("Item [" + inv.Number + "] name=[" + inv.Name + "]");
                    ItemCache[code] = true;
                    return true;
                }
                AppLog.Error("Item not found: " + code);
                ItemCache[code] = false;
                return false;
            }
            catch (Exception ex)
            {
                AppLog.Error("Item lookup failed: " + ex.Message);
                return false;
            }
            finally
            {
                SDKInstanceManager.Instance.CloseInventoryLedger();
            }
        }

        static string EscapeSql(string s)
        {
            return (s ?? "").Replace("'", "''");
        }
    }
}
