using System;
using System.Data;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Simply.Domain.Utility;
using SimplySDK;
using SimplySDK.InventoryModule;
using SimplySDK.PayrollModule;
using SimplySDK.Support;

namespace SageWriteSlip
{
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
        const string DefaultSai = @"T:\Databases\2025 MACK KIRK.SAI";
        const string ImportExe = @"C:\Program Files (x86)\Sage 50 Premium Accounting Version 2026\Sage_SA_import.exe";

        public static int Main(string[] args)
        {
            string sai = GetArg(args, "--sai") ?? Environment.GetEnvironmentVariable("SAGE_SAI") ?? DefaultSai;
            string user = GetArg(args, "--user") ?? Environment.GetEnvironmentVariable("SAGE_USER") ?? "sysadmin";
            string password = GetArg(args, "--password") ?? Environment.GetEnvironmentVariable("SAGE_PASSWORD") ?? "";
            string empWanted = GetArg(args, "--employee") ?? "Lee Ouderkirk";
            string item = GetArg(args, "--item") ?? "VeriClock";
            string customer = GetArg(args, "--customer") ?? "0 Customer";
            string hours = GetArg(args, "--hours") ?? "01:00:00";
            string slipNo = GetArg(args, "--slip") ?? ("MKHUB" + DateTime.Now.ToString("yyyyMMddHHmm"));
            if (slipNo.Length > 20) slipNo = slipNo.Substring(0, 20);
            string date = GetArg(args, "--date") ?? DateTime.Now.ToString("MM-dd-yyyy");

            Console.WriteLine("MKHub Sage WRITE probe — one Time Slip on Development only");
            Console.WriteLine("SAI: " + sai);
            Console.WriteLine("Slip: " + slipNo + "  employee=" + empWanted + "  item=" + item + "  " + hours);

            if (!File.Exists(sai))
            {
                Console.WriteLine("ERROR: .SAI not found");
                return 2;
            }

            SDKInstanceManager.Instance.SetAlertImplementation(new QuietAlert());

            bool inspectOnly = Array.IndexOf(args, "--inspect-only") >= 0;
            if (inspectOnly)
            {
                Console.WriteLine("=== INSPECT ONLY (no import) ===");
                return WithDb(sai, user, password, delegate
                {
                    DumpSlipTables("inspect");
                    DumpSlipSchema();
                    DumpTimeSlipLines();
                }) ? 0 : 1;
            }

            if (!File.Exists(ImportExe))
            {
                Console.WriteLine("ERROR: Sage_SA_import.exe not found");
                return 2;
            }

            SDKInstanceManager.Instance.SetAlertImplementation(new QuietAlert());

            string empExact = empWanted;
            Console.WriteLine();
            Console.WriteLine("=== BEFORE import ===");
            if (!WithDb(sai, user, password, delegate
            {
                empExact = ResolveEmployeeName(empWanted);
                DumpItem(item);
                DumpSlipTables("before");
                DumpSlipSchema();
            }))
                return 1;

            string impPath = Path.Combine(Path.GetTempPath(), "mkhub-timeslip-test.imp");
            WriteImp(impPath, empExact, slipNo, date, customer, item, hours);
            Console.WriteLine();
            Console.WriteLine("IMP written: " + impPath);
            Console.WriteLine(File.ReadAllText(impPath));

            Console.WriteLine("Running Sage_SA_import.exe (official Time Slip write path)...");
            Console.WriteLine("A watcher will auto-answer mapping dialogs (will NOT strip Internal on VeriClock).");
            int importCode = RunImport(impPath, sai, item, customer, password);
            Console.WriteLine("import exit code: " + importCode);

            Console.WriteLine();
            Console.WriteLine("=== AFTER import ===");
            if (!WithDb(sai, user, password, delegate
            {
                DumpSlipTables("after");
                DumpTimeSlipLines();
                SearchSlip(slipNo, empExact);
            }))
                return 1;

            return importCode == 0 ? 0 : 3;
        }

        static bool WithDb(string sai, string user, string password, Action body)
        {
            SDKInstanceManager.SDKResult result;
            bool opened = SDKInstanceManager.Instance.OpenDatabase(
                sai, user, password, true, "MKHub Companion", "MKHUB", 1, out result);
            if (!opened)
            {
                Console.WriteLine("OpenDatabase failed: " + result);
                return false;
            }
            try
            {
                body();
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine("ERROR: " + ex.Message);
                return false;
            }
            finally
            {
                SDKInstanceManager.Instance.CloseDatabase();
            }
        }

        static string ResolveEmployeeName(string wanted)
        {
            EmployeeLedgerBase emp = SDKInstanceManager.Instance.OpenEmployeeLedger();
            try
            {
                if (emp.LoadByName(wanted))
                {
                    Console.WriteLine("Employee ledger name: [" + emp.Name + "]");
                    return emp.Name;
                }
                Console.WriteLine("WARNING: employee not found by LoadByName: " + wanted);
            }
            finally
            {
                SDKInstanceManager.Instance.CloseEmployeeLedger();
            }
            return wanted;
        }

        static void DumpItem(string code)
        {
            InventoryLedger inv = SDKInstanceManager.Instance.OpenInventoryLedger();
            try
            {
                if (inv.LoadByPartCode(code))
                    Console.WriteLine("Item [{0}] name=[{1}] service={2} activity={3}",
                        inv.Number, inv.Name, inv.IsServiceType, inv.IsActivityType);
                else
                    Console.WriteLine("Item [{0}] not found by part code", code);
            }
            catch (Exception ex)
            {
                Console.WriteLine("Item dump failed: " + ex.Message);
            }
            finally
            {
                SDKInstanceManager.Instance.CloseInventoryLedger();
            }
        }

        static void DumpSlipTables(string label)
        {
            var util = new SDKDatabaseUtility();
            try
            {
                int n = util.RunSelectQuery(
                    "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='simply' AND TABLE_NAME LIKE '%slip%' ORDER BY TABLE_NAME");
                Console.WriteLine("[" + label + "] slip tables: " + n);
                for (int i = 0; i < n; i++)
                {
                    string table = util.GetStringFromLastSelectQuery(i, 0);
                    object cnt = "?";
                    try { cnt = new SDKDatabaseUtility().RunScalerQuery("SELECT COUNT(*) FROM " + table); }
                    catch { }
                    Console.WriteLine("  " + table + " COUNT=" + cnt);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("slip table list failed: " + ex.Message);
            }
        }

        static void DumpTimeSlipLines()
        {
            var util = new SDKDatabaseUtility();
            Console.WriteLine("--- tables named tts* ---");
            DumpQuery(util, "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='simply' AND TABLE_NAME LIKE 'tts%' ORDER BY TABLE_NAME");
            Console.WriteLine("--- ttsline columns ---");
            DumpQuery(util, "SHOW COLUMNS FROM ttsline");
            Console.WriteLine("--- ttsline latest rows ---");
            DumpQuery(util, "SELECT * FROM ttsline ORDER BY lTSRecId DESC LIMIT 5");
            Console.WriteLine("--- pstrdtts columns ---");
            DumpQuery(util, "SHOW COLUMNS FROM pstrdtts");
            Console.WriteLine("--- pstrdtts latest ---");
            DumpQuery(util, "SELECT * FROM pstrdtts ORDER BY lTSRecId DESC LIMIT 3");
            Console.WriteLine("--- ttsliprj for max slip ---");
            DumpQuery(util, "SELECT * FROM ttsliprj WHERE lTSRecId = (SELECT MAX(lTSRecId) FROM ttsline)");
            Console.WriteLine("--- ttsrec columns ---");
            DumpQuery(util, "SHOW COLUMNS FROM ttsrec");
            Console.WriteLine("--- ttsrec our slip vs last VeriClock ---");
            DumpQuery(util, "SELECT * FROM ttsrec WHERE lId IN (154152, 154151, 154150)");
            Console.WriteLine("--- VeriClock project allocations on 154151 ---");
            DumpQuery(util, "SELECT * FROM ttsliprj WHERE lTSRecId=154151");
            Console.WriteLine("--- project names ---");
            DumpQuery(util, "SELECT lId, sName FROM tproject WHERE lId IN (2593, 1201)");
        }

        static void DumpSlipSchema()
        {
            var util = new SDKDatabaseUtility();
            Console.WriteLine("--- tables with lTSRecId ---");
            DumpQuery(util, "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='simply' AND COLUMN_NAME LIKE '%TSRec%' ORDER BY TABLE_NAME");
            Console.WriteLine("--- tables named like slip/time/tbill ---");
            DumpQuery(util, "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='simply' AND (TABLE_NAME LIKE '%slip%' OR TABLE_NAME LIKE '%tbill%' OR TABLE_NAME LIKE '%tslip%' OR TABLE_NAME LIKE '%tme%') ORDER BY TABLE_NAME");
            Console.WriteLine("--- ttsliprj columns ---");
            DumpQuery(util, "SHOW COLUMNS FROM ttsliprj");
            Console.WriteLine("--- ttsliprj sample row ---");
            DumpQuery(util, "SELECT * FROM ttsliprj LIMIT 1");
        }

        static void DumpQuery(SDKDatabaseUtility util, string sql)
        {
            try
            {
                int n = util.RunSelectQuery(sql);
                Console.WriteLine("SQL (" + n + " rows): " + sql);
                DataSet ds = util.GetDataSetFromLastSelectQuery();
                if (ds == null || ds.Tables.Count == 0)
                {
                    Console.WriteLine("  (empty dataset)");
                    return;
                }
                DataTable t = ds.Tables[0];
                var names = new StringBuilder();
                for (int c = 0; c < t.Columns.Count; c++)
                {
                    if (c > 0) names.Append(" | ");
                    names.Append(t.Columns[c].ColumnName);
                }
                Console.WriteLine("  cols: " + names);
                int max = t.Rows.Count < 40 ? t.Rows.Count : 40;
                for (int r = 0; r < max; r++)
                {
                    var line = new StringBuilder();
                    for (int c = 0; c < t.Columns.Count; c++)
                    {
                        if (c > 0) line.Append(" | ");
                        object v = t.Rows[r][c];
                        string s = v == null || v == DBNull.Value ? "" : v.ToString();
                        if (s.Length > 40) s = s.Substring(0, 40) + "...";
                        line.Append(s);
                    }
                    Console.WriteLine("  row" + r + ": " + line);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("SQL fail: " + sql + " -> " + ex.Message);
            }
        }

        static void SearchSlip(string slipNo, string empName)
        {
            var util = new SDKDatabaseUtility();
            DumpQuery(util, "SELECT * FROM ttsliprj WHERE CAST(ttsliprj AS CHAR) LIKE '%MKHUB%' LIMIT 3");
            string[] tries = {
                "SELECT * FROM ttsliprj WHERE sSlipNo LIKE '%MKHUB%' LIMIT 5",
                "SELECT * FROM ttsliprj WHERE sNumber LIKE '%MKHUB%' LIMIT 5",
                "SELECT * FROM ttsliprj WHERE sName LIKE '%MKHUB%' LIMIT 5",
                "SELECT * FROM ttsliprj WHERE sComment LIKE '%MKHUB%' LIMIT 5",
                "SELECT * FROM ttsliprj WHERE sText LIKE '%MKHUB%' LIMIT 5"
            };
            foreach (string sql in tries)
                DumpQuery(util, sql);
        }

        static void WriteImp(string path, string employee, string slipNo, string date, string customer, string item, string time)
        {
            var sb = new StringBuilder();
            sb.AppendLine("<Version>");
            sb.AppendLine("\"12001\", \"1\"");
            sb.AppendLine("</Version>");
            sb.AppendLine("<Timeslip>");
            sb.AppendLine("\"" + Escape(employee) + "\"");
            sb.AppendLine("\"1\",\"" + Escape(slipNo) + "\",\"" + Escape(date) + "\"");
            sb.AppendLine("\"" + Escape(customer) + "\",\"" + Escape(item) + "\",\"" + Escape(time) + "\"");
            sb.AppendLine("</Timeslip>");
            File.WriteAllText(path, sb.ToString(), Encoding.ASCII);
        }

        static string Escape(string s)
        {
            return (s ?? "").Replace("\"", "'");
        }

        static int RunImport(string impPath, string sai, string itemHint, string customerHint, string sagePassword)
        {
            var psi = new ProcessStartInfo();
            psi.FileName = ImportExe;
            psi.Arguments = "\"" + impPath + "\" \"" + sai + "\"";
            psi.UseShellExecute = false;
            psi.CreateNoWindow = false;
            var p = Process.Start(psi);
            if (p == null) return -1;

            var watcher = new Thread(() => ImportDialogWatcher.Pump(p.Id, itemHint, customerHint, sagePassword));
            watcher.IsBackground = true;
            watcher.Start();

            if (!p.WaitForExit(180000))
            {
                try { p.Kill(); } catch { }
                Console.WriteLine("import TIMED OUT (3 min)");
                return -2;
            }
            return p.ExitCode;
        }

        static string GetArg(string[] args, string name)
        {
            int i = Array.IndexOf(args, name);
            if (i < 0 || i + 1 >= args.Length) return null;
            return args[i + 1];
        }
    }

    static class ImportDialogWatcher
    {
        const int LB_GETCOUNT = 0x018B;
        const int LB_GETTEXT = 0x0189;
        const int LB_GETTEXTLEN = 0x018A;
        const int LB_SETCURSEL = 0x0186;
        const int BM_CLICK = 0x00F5;
        const int WM_GETTEXT = 0x000D;
        const int WM_CLOSE = 0x0010;

        [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lp);
        [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr hWnd, EnumProc cb, IntPtr lp);
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
        [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern int GetWindowText(IntPtr hWnd, StringBuilder s, int n);
        [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern int GetClassName(IntPtr hWnd, StringBuilder s, int n);
        [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr hWnd);
        [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
        [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
        [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern int SendMessage(IntPtr hWnd, int msg, IntPtr wParam, StringBuilder lParam);
        [DllImport("user32.dll", CharSet = CharSet.Auto)] static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, string lParam);
        [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
        [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr hWnd, int nIndex);
        delegate bool EnumProc(IntPtr hWnd, IntPtr lp);

        public static void Pump(int pid, string itemHint, string customerHint, string sagePassword)
        {
            var seen = new System.Collections.Generic.HashSet<string>();
            for (int i = 0; i < 360; i++)
            {
                try { Handle(pid, itemHint, customerHint, sagePassword, seen); }
                catch (Exception ex) { Console.WriteLine("[watcher] " + ex.Message); }
                Thread.Sleep(500);
            }
        }

        static void Handle(int pid, string itemHint, string customerHint, string sagePassword, System.Collections.Generic.HashSet<string> seen)
        {
            EnumWindows(delegate(IntPtr hwnd, IntPtr lp)
            {
                uint wpid;
                GetWindowThreadProcessId(hwnd, out wpid);
                if ((int)wpid != pid || !IsWindowVisible(hwnd)) return true;
                var title = TextOf(hwnd);
                var body = CollectText(hwnd);
                string key = title + "|" + Trim(body, 180);
                bool first = seen.Add(key);
                if (first)
                    Console.WriteLine("[dialog] " + title + " :: " + Trim(body, 240));

                if (!first) return true;

                if (title.IndexOf("Password", StringComparison.OrdinalIgnoreCase) >= 0
                    || body.IndexOf("Enter Password", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    if (!FillPassword(hwnd, sagePassword)) seen.Remove(key);
                    return true;
                }

                if (body.IndexOf("internal service", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    ClickNamed(hwnd, "No");
                    return true;
                }
                if (title.IndexOf("Select Activity", StringComparison.OrdinalIgnoreCase) >= 0
                    || body.IndexOf("Select Activity", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    if (!PickList(hwnd, itemHint)) seen.Remove(key);
                    return true;
                }
                if (title.IndexOf("Select Customer", StringComparison.OrdinalIgnoreCase) >= 0
                    || body.IndexOf("Select Customer", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    if (!PickList(hwnd, customerHint)) seen.Remove(key);
                    return true;
                }
                if (body.IndexOf("successfully", StringComparison.OrdinalIgnoreCase) >= 0
                    || body.IndexOf("import complete", StringComparison.OrdinalIgnoreCase) >= 0
                    || title.IndexOf("Import Complete", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    ClickNamed(hwnd, "OK");
                    ClickNamed(hwnd, "Close");
                    return true;
                }
                if (body.IndexOf("Select Payroll", StringComparison.OrdinalIgnoreCase) >= 0
                    || title.IndexOf("Payroll", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    if (!PickList(hwnd, "Regular") && !PickList(hwnd, "Non-Payroll"))
                        seen.Remove(key);
                    return true;
                }
                return true;
            }, IntPtr.Zero);
        }

        static bool PickList(IntPtr parent, string hint)
        {
            IntPtr list = IntPtr.Zero;
            IntPtr selectBtn = IntPtr.Zero;
            EnumChildWindows(parent, delegate(IntPtr h, IntPtr lp)
            {
                string cls = ClassOf(h);
                int id = GetDlgCtrlID(h);
                if (cls == "ListBox") list = h;
                if (cls == "Button" && (id == 1 || TextOf(h).IndexOf("Select", StringComparison.OrdinalIgnoreCase) >= 0))
                    selectBtn = h;
                return true;
            }, IntPtr.Zero);
            if (list == IntPtr.Zero || selectBtn == IntPtr.Zero) return false;
            int count = SendMessage(list, LB_GETCOUNT, IntPtr.Zero, IntPtr.Zero).ToInt32();
            if (count <= 0) return false;
            int pick = -1;
            for (int i = 0; i < count; i++)
            {
                int len = SendMessage(list, LB_GETTEXTLEN, (IntPtr)i, IntPtr.Zero).ToInt32();
                var buf = new StringBuilder(len + 4);
                SendMessage(list, LB_GETTEXT, (IntPtr)i, buf);
                string row = buf.ToString();
                if (i < 20) Console.WriteLine("  list[" + i + "] " + Trim(row, 80));
                if (pick < 0 && row.IndexOf(hint, StringComparison.OrdinalIgnoreCase) >= 0)
                    pick = i;
            }
            if (pick < 0 && count > 0) pick = 0;
            if (pick < 0) return false;
            Console.WriteLine("[watcher] picking list index " + pick + " for hint [" + hint + "]");
            SendMessage(list, LB_SETCURSEL, (IntPtr)pick, IntPtr.Zero);
            SetForegroundWindow(parent);
            SendMessage(selectBtn, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
            return true;
        }

        static bool FillPassword(IntPtr parent, string password)
        {
            if (string.IsNullOrEmpty(password))
            {
                Console.WriteLine("[watcher] password dialog but no password provided");
                return true;
            }
            const int GWL_STYLE = -16;
            const int ES_PASSWORD = 0x0020;
            const int WM_SETTEXT = 0x000C;
            IntPtr pwdEdit = IntPtr.Zero;
            EnumChildWindows(parent, delegate(IntPtr h, IntPtr lp)
            {
                if (ClassOf(h) == "Edit")
                {
                    int style = GetWindowLong(h, GWL_STYLE);
                    if ((style & ES_PASSWORD) != 0) pwdEdit = h;
                }
                return true;
            }, IntPtr.Zero);
            if (pwdEdit == IntPtr.Zero)
            {
                Console.WriteLine("[watcher] password edit not found yet");
                return false;
            }
            Console.WriteLine("[watcher] filling Sage import password");
            SetForegroundWindow(parent);
            SendMessage(pwdEdit, WM_SETTEXT, IntPtr.Zero, password);
            ClickNamed(parent, "OK");
            return true;
        }

        static void ClickNamed(IntPtr parent, string name)
        {
            EnumChildWindows(parent, delegate(IntPtr h, IntPtr lp)
            {
                if (ClassOf(h) == "Button" && string.Equals(TextOf(h).Replace("&", ""), name, StringComparison.OrdinalIgnoreCase))
                {
                    Console.WriteLine("[watcher] click " + name);
                    SetForegroundWindow(parent);
                    SendMessage(h, BM_CLICK, IntPtr.Zero, IntPtr.Zero);
                }
                return true;
            }, IntPtr.Zero);
        }

        static string CollectText(IntPtr parent)
        {
            var sb = new StringBuilder();
            sb.Append(TextOf(parent));
            EnumChildWindows(parent, delegate(IntPtr h, IntPtr lp)
            {
                string t = TextOf(h);
                if (t.Length > 0) { sb.Append(" | "); sb.Append(t); }
                return true;
            }, IntPtr.Zero);
            return sb.ToString();
        }

        static string TextOf(IntPtr h)
        {
            var sb = new StringBuilder(512);
            GetWindowText(h, sb, sb.Capacity);
            if (sb.Length == 0)
            {
                var buf = new StringBuilder(512);
                SendMessage(h, WM_GETTEXT, (IntPtr)buf.Capacity, buf);
                return buf.ToString();
            }
            return sb.ToString();
        }

        static string ClassOf(IntPtr h)
        {
            var sb = new StringBuilder(256);
            GetClassName(h, sb, sb.Capacity);
            return sb.ToString();
        }

        static string Trim(string s, int n)
        {
            if (s == null) return "";
            s = s.Replace("\r", " ").Replace("\n", " ");
            return s.Length <= n ? s : s.Substring(0, n) + "...";
        }
    }
}
