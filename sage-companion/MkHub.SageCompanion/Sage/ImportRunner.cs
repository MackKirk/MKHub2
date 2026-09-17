using System;
using System.Diagnostics;
using System.Threading;

namespace MkHub.SageCompanion.Sage
{
    public static class ImportRunner
    {
        public static int Run(string importExe, string impPath, string sai, string itemHint, string customerHint, string sagePassword)
        {
            var psi = new ProcessStartInfo();
            psi.FileName = importExe;
            psi.Arguments = "\"" + impPath + "\" \"" + sai + "\"";
            psi.UseShellExecute = false;
            psi.CreateNoWindow = false;
            var p = Process.Start(psi);
            if (p == null) return -1;

            var watcher = new Thread(() => ImportDialogWatcher.Pump(p.Id, itemHint, customerHint, sagePassword));
            watcher.IsBackground = true;
            watcher.Start();

            if (!p.WaitForExit(600000))
            {
                try { p.Kill(); } catch { }
                AppLog.Error("Sage import TIMED OUT (10 min)");
                return -2;
            }
            return p.ExitCode;
        }
    }
}
