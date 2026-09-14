using System;
using System.IO;
using Simply.Domain.Utility;
using SimplySDK;
using SimplySDK.InventoryModule;
using SimplySDK.PayrollModule;
using SimplySDK.ProjectModule;
using SimplySDK.ReceivableModule;
using SimplySDK.Support;

namespace SageProbe
{
    /// <summary>
    /// Read-only probe: open the Development .SAI and print mapping catalogs.
    /// Does not create Time Slips. Requires Sage 50 SDK 2026.2 (x86).
    /// </summary>
    public class QuietAlert : SDKAlert
    {
        public override AlertResult AskAlert(SimplyMessage message)
        {
            Console.WriteLine("[Sage ask] " + message.Message);
            return AlertResult.NO;
        }

        public override AlertResult AskSaveAlert()
        {
            return AlertResult.NO;
        }

        public override AlertResult YNCAlert(SimplyMessage message)
        {
            Console.WriteLine("[Sage y/n/c] " + message.Message);
            return AlertResult.NO;
        }

        public override void StopAlert(SimplyMessage message)
        {
            Console.WriteLine("[Sage stop] " + message.Message);
        }

        public override bool StopAlertNotShow(SimplyMessage message)
        {
            Console.WriteLine("[Sage] " + message.Message);
            return false;
        }
    }

    public static class Program
    {
        public static int Main(string[] args)
        {
            string sai = GetArg(args, "--sai")
                ?? Environment.GetEnvironmentVariable("SAGE_SAI")
                ?? @"T:\Databases\2025 MACK KIRK.SAI";
            string user = GetArg(args, "--user")
                ?? Environment.GetEnvironmentVariable("SAGE_USER");
            string password = GetArg(args, "--password")
                ?? Environment.GetEnvironmentVariable("SAGE_PASSWORD")
                ?? "";

            Console.WriteLine("MKHub Sage probe (read-only)");
            Console.WriteLine("SAI: " + sai);

            if (!File.Exists(sai))
            {
                Console.WriteLine("ERROR: .SAI not found.");
                return 2;
            }

            string saj = Path.ChangeExtension(sai, ".SAJ");
            if (string.Equals(Path.GetExtension(sai), ".SAI", StringComparison.OrdinalIgnoreCase))
                saj = sai.Substring(0, sai.Length - 4) + ".SAJ";
            if (!Directory.Exists(saj))
            {
                Console.WriteLine("ERROR: .SAJ folder not found: " + saj);
                return 2;
            }

            if (string.IsNullOrWhiteSpace(user))
            {
                Console.Write("Sage username: ");
                user = Console.ReadLine();
            }
            if (password.Length == 0 && Array.IndexOf(args, "--password") < 0)
            {
                Console.Write("Sage password (blank ok): ");
                password = Console.ReadLine() ?? "";
            }

            SDKInstanceManager.Instance.SetAlertImplementation(new QuietAlert());

            // Multi-user: Sage GUI may already have this Development file open.
            const string appName = "MKHub Companion";
            const string appCode = "MKHUB";
            const short appVer = 1;
            bool multiUser = true;

            Console.WriteLine("Opening database (multi-user, third-party " + appCode + ")...");
            SDKInstanceManager.SDKResult result;
            bool opened = SDKInstanceManager.Instance.OpenDatabase(
                sai, user, password, multiUser, appName, appCode, appVer, out result);

            if (!opened)
            {
                Console.WriteLine("OpenDatabase failed: " + result);
                Console.WriteLine("If the result is FAIL_INVALID_SECURITY_DETAILS, enable third-party access on this Sage user.");
                Console.WriteLine("If FAIL_ANOTHER_DATABASE_IS_OPEN, close this probe or Sage and retry.");
                return 1;
            }

            Console.WriteLine("Opened OK (" + result + ")");
            try
            {
                DumpSqlCatalog();
                DumpAllItems();
                DumpKnownItems();
                DumpKnownProjects();
                DumpProjectSearch();
                DumpKnownEmployees();
                DumpCustomer("0 Customer");
            }
            catch (Exception ex)
            {
                Console.WriteLine("ERROR while reading: " + ex.GetType().Name + ": " + ex.Message);
                return 1;
            }
            finally
            {
                SDKInstanceManager.Instance.CloseDatabase();
                Console.WriteLine("Database closed.");
            }

            return 0;
        }

        static void DumpSqlCatalog()
        {
            var util = new SDKDatabaseUtility();
            Console.WriteLine();
            Console.WriteLine("--- SQL catalog (first 80 tables matching emp/inv/proj/time/slip) ---");
            try
            {
                int n = util.RunSelectQuery(
                    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'simply' ORDER BY TABLE_NAME");
                Console.WriteLine("tables: " + n);
                int shown = 0;
                for (int i = 0; i < n && shown < 80; i++)
                {
                    string name = util.GetStringFromLastSelectQuery(i, 0);
                    if (name == null) continue;
                    string lower = name.ToLowerInvariant();
                    if (lower.IndexOf("emp") >= 0 || lower.IndexOf("inv") >= 0 || lower.IndexOf("proj") >= 0
                        || lower.IndexOf("time") >= 0 || lower.IndexOf("slip") >= 0 || lower.IndexOf("cust") >= 0
                        || lower.IndexOf("pay") >= 0 || lower.IndexOf("inc") >= 0)
                    {
                        Console.WriteLine("  " + name);
                        shown++;
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("information_schema failed (" + ex.Message + "). Trying known tables...");
            }

            PrintCount(util, "tInvent");
            PrintCount(util, "tProject");
            PrintCount(util, "tEmployee");
            PrintCount(util, "tEmply");
            PrintCount(util, "tCust");
            PrintCount(util, "tCustomer");
        }

        static void PrintCount(SDKDatabaseUtility util, string table)
        {
            try
            {
                object raw = util.RunScalerQuery("SELECT COUNT(*) FROM " + table);
                Console.WriteLine("COUNT " + table + " = " + raw);
            }
            catch
            {
                Console.WriteLine("COUNT " + table + " = (missing)");
            }
        }

        static void DumpAllItems()
        {
            Console.WriteLine();
            Console.WriteLine("--- All inventory / service codes (tinvent) ---");
            var util = new SDKDatabaseUtility();
            try
            {
                int n = util.RunSelectQuery("SELECT sPartCode, sName FROM tinvent ORDER BY sPartCode");
                Console.WriteLine("tinvent rows: " + n);
                for (int i = 0; i < n; i++)
                {
                    Console.WriteLine("  {0} | {1}",
                        util.GetStringFromLastSelectQuery(i, 0),
                        util.GetStringFromLastSelectQuery(i, 1));
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("tinvent sPartCode failed: " + ex.Message);
                try
                {
                    int n = util.RunSelectQuery("SHOW COLUMNS FROM tinvent");
                    Console.WriteLine("tinvent columns: " + n);
                    int max = n < 30 ? n : 30;
                    for (int i = 0; i < max; i++)
                        Console.WriteLine("  " + util.GetStringFromLastSelectQuery(i, 0));
                }
                catch (Exception ex2)
                {
                    Console.WriteLine("SHOW COLUMNS failed: " + ex2.Message);
                }
            }
        }

        static void DumpProjectSearch()
        {
            Console.WriteLine();
            Console.WriteLine("--- Projects containing 8510 / FD / MC ---");
            var util = new SDKDatabaseUtility();
            string[] sqls = {
                "SELECT sName FROM tproject WHERE sName LIKE '%8510%' OR sName LIKE '%FD85%' OR sName LIKE '%MC85%' ORDER BY sName",
                "SHOW COLUMNS FROM tproject"
            };
            try
            {
                int n = util.RunSelectQuery(sqls[0]);
                Console.WriteLine("matches: " + n);
                int max = n < 50 ? n : 50;
                for (int i = 0; i < max; i++)
                    Console.WriteLine("  " + util.GetStringFromLastSelectQuery(i, 0));
            }
            catch (Exception ex)
            {
                Console.WriteLine("project search failed: " + ex.Message);
            }
            try
            {
                int n = util.RunSelectQuery("SHOW COLUMNS FROM tproject");
                Console.WriteLine("tproject columns:");
                int max = n < 25 ? n : 25;
                for (int i = 0; i < max; i++)
                    Console.WriteLine("  " + util.GetStringFromLastSelectQuery(i, 0));
            }
            catch (Exception ex)
            {
                Console.WriteLine("tproject columns failed: " + ex.Message);
            }
        }

        static void DumpKnownItems()
        {
            Console.WriteLine();
            Console.WriteLine("--- Items / services (Work Types) ---");
            string[] codes = { "VeriCloc", "101", "102", "500", "Electrical", "Regular" };
            InventoryLedger inv = SDKInstanceManager.Instance.OpenInventoryLedger();
            try
            {
                foreach (string code in codes)
                {
                    try
                    {
                        if (inv.LoadByPartCode(code))
                        {
                            Console.WriteLine("  ITEM {0} | {1} | service={2} activity={3}",
                                inv.Number, inv.Name, inv.IsServiceType, inv.IsActivityType);
                        }
                        else
                            Console.WriteLine("  ITEM {0} | not found", code);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("  ITEM {0} | error {1}", code, ex.Message);
                    }
                }
            }
            finally
            {
                SDKInstanceManager.Instance.CloseInventoryLedger();
            }
        }

        static void DumpKnownProjects()
        {
            Console.WriteLine();
            Console.WriteLine("--- Projects ---");
            string[] names = { "FD8510", "MC8510" };
            ProjectLedger proj = SDKInstanceManager.Instance.OpenProjectLedger();
            try
            {
                foreach (string name in names)
                {
                    try
                    {
                        if (proj.LoadByName(name))
                            Console.WriteLine("  PROJECT {0} | alt={1}", proj.Name, proj.NameAlt);
                        else
                            Console.WriteLine("  PROJECT {0} | not found (may be a longer display name)", name);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("  PROJECT {0} | error {1}", name, ex.Message);
                    }
                }
            }
            finally
            {
                SDKInstanceManager.Instance.CloseProjectLedger();
            }

            try
            {
                var util = new SDKDatabaseUtility();
                int n = util.RunSelectQuery("SELECT sName FROM tProject ORDER BY sName");
                Console.WriteLine("tProject rows: " + n + " (showing up to 40)");
                int max = n < 40 ? n : 40;
                for (int i = 0; i < max; i++)
                    Console.WriteLine("  " + util.GetStringFromLastSelectQuery(i, 0));
            }
            catch (Exception ex)
            {
                Console.WriteLine("tProject list failed: " + ex.Message);
            }
        }

        static void DumpKnownEmployees()
        {
            Console.WriteLine();
            Console.WriteLine("--- Employees (spot check) ---");
            string[] names = { "Lee Ouderkirk", "Duc Son Hoang", "sysadmin" };
            EmployeeLedgerBase emp = SDKInstanceManager.Instance.OpenEmployeeLedger();
            try
            {
                foreach (string name in names)
                {
                    try
                    {
                        if (emp.LoadByName(name))
                            Console.WriteLine("  EMP {0}", emp.Name);
                        else
                            Console.WriteLine("  EMP {0} | not found", name);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("  EMP {0} | error {1}", name, ex.Message);
                    }
                }
            }
            finally
            {
                SDKInstanceManager.Instance.CloseEmployeeLedger();
            }
        }

        static void DumpCustomer(string name)
        {
            Console.WriteLine();
            Console.WriteLine("--- Customer ---");
            CustomerLedger cust = SDKInstanceManager.Instance.OpenCustomerLedger();
            try
            {
                if (cust.LoadByName(name))
                    Console.WriteLine("  CUSTOMER {0}", cust.Name);
                else
                    Console.WriteLine("  CUSTOMER {0} | not found", name);
            }
            catch (Exception ex)
            {
                Console.WriteLine("  CUSTOMER error " + ex.Message);
            }
            finally
            {
                SDKInstanceManager.Instance.CloseCustomerLedger();
            }
        }

        static string GetArg(string[] args, string name)
        {
            int i = Array.IndexOf(args, name);
            if (i < 0 || i + 1 >= args.Length) return null;
            return args[i + 1];
        }
    }
}
