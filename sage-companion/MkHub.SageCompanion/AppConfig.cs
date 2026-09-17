using System;
using System.IO;
using System.Web.Script.Serialization;

namespace MkHub.SageCompanion
{
    public class AppConfig
    {
        public string SaiPath { get; set; }
        public string SageUser { get; set; }
        public string SagePassword { get; set; }
        public string ImportExe { get; set; }
        public string EmployeeName { get; set; }
        public string Item { get; set; }
        public string Customer { get; set; }
        public string Hours { get; set; }
        public string HubBaseUrl { get; set; }
        public string HubSecret { get; set; }
        public bool DryRun { get; set; }

        static readonly JavaScriptSerializer Json = new JavaScriptSerializer();

        public static string ConfigPath
        {
            get { return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "appsettings.local.json"); }
        }

        public static AppConfig Defaults()
        {
            return new AppConfig
            {
                SaiPath = @"T:\Databases\2025 MACK KIRK.SAI",
                SageUser = "",
                SagePassword = "",
                ImportExe = @"C:\Program Files (x86)\Sage 50 Premium Accounting Version 2026\Sage_SA_import.exe",
                EmployeeName = "Lee Ouderkirk",
                Item = "101",
                Customer = "0 Customer",
                Hours = "01:00:00",
                HubBaseUrl = "http://127.0.0.1:8000",
                HubSecret = "",
                DryRun = true
            };
        }

        public static AppConfig Load()
        {
            var cfg = Defaults();
            TryMerge(cfg, Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "appsettings.json"));
            TryMerge(cfg, ConfigPath);
            return cfg;
        }

        static void TryMerge(AppConfig target, string path)
        {
            if (!File.Exists(path)) return;
            try
            {
                var loaded = Json.Deserialize<AppConfig>(File.ReadAllText(path));
                if (loaded == null) return;
                if (!string.IsNullOrWhiteSpace(loaded.SaiPath)) target.SaiPath = loaded.SaiPath;
                if (loaded.SageUser != null) target.SageUser = loaded.SageUser;
                if (loaded.SagePassword != null) target.SagePassword = loaded.SagePassword;
                if (!string.IsNullOrWhiteSpace(loaded.ImportExe)) target.ImportExe = loaded.ImportExe;
                if (!string.IsNullOrWhiteSpace(loaded.EmployeeName)) target.EmployeeName = loaded.EmployeeName;
                if (!string.IsNullOrWhiteSpace(loaded.Item)) target.Item = loaded.Item;
                if (!string.IsNullOrWhiteSpace(loaded.Customer)) target.Customer = loaded.Customer;
                if (!string.IsNullOrWhiteSpace(loaded.Hours)) target.Hours = loaded.Hours;
                if (loaded.HubBaseUrl != null) target.HubBaseUrl = loaded.HubBaseUrl;
                if (loaded.HubSecret != null) target.HubSecret = loaded.HubSecret;
                target.DryRun = loaded.DryRun;
            }
            catch (Exception ex)
            {
                AppLog.Error("Could not read " + path + ": " + ex.Message);
            }
        }

        public void Save()
        {
            File.WriteAllText(ConfigPath, Json.Serialize(this));
        }
    }
}
