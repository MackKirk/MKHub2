using System;
using System.Windows.Forms;
using MkHub.SageCompanion.UI;

namespace MkHub.SageCompanion
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            AppLog.Init();
            Application.Run(new TrayApplicationContext());
        }
    }
}
