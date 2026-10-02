"""
Script master para sincronizar todos os dados do BambooHR para o MKHub

Este script executa todas as sincronizações em sequência:
1. Funcionários (Employees)
2. Treinamentos (Training)
3. Documentos (Documents)

Uso:
    python scripts/sync_bamboohr_all.py [--dry-run] [--skip-employees] [--skip-training] [--skip-documents] [--limit LIMIT]
"""
import sys
import os
import argparse

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# Import sync functions
import importlib.util
import os

script_dir = os.path.dirname(os.path.abspath(__file__))

# Import employees sync
spec_emp = importlib.util.spec_from_file_location("sync_employees", os.path.join(script_dir, "sync_bamboohr_employees.py"))
sync_employees_mod = importlib.util.module_from_spec(spec_emp)
spec_emp.loader.exec_module(sync_employees_mod)
sync_employees = sync_employees_mod.sync_employees

# Import training sync
spec_train = importlib.util.spec_from_file_location("sync_training", os.path.join(script_dir, "sync_bamboohr_training.py"))
sync_training_mod = importlib.util.module_from_spec(spec_train)
spec_train.loader.exec_module(sync_training_mod)
sync_all_training = sync_training_mod.sync_all_training

# Import documents sync
spec_docs = importlib.util.spec_from_file_location("sync_documents", os.path.join(script_dir, "sync_bamboohr_documents.py"))
sync_documents_mod = importlib.util.module_from_spec(spec_docs)
spec_docs.loader.exec_module(sync_documents_mod)
sync_all_documents = sync_documents_mod.sync_all_documents

# Import time-off sync
spec_to = importlib.util.spec_from_file_location(
    "sync_time_off", os.path.join(script_dir, "sync_bamboohr_time_off.py")
)
sync_time_off_mod = importlib.util.module_from_spec(spec_to)
spec_to.loader.exec_module(sync_time_off_mod)
sync_all_time_off = sync_time_off_mod.sync_all_time_off

# Import compensation history sync
spec_comp = importlib.util.spec_from_file_location(
    "sync_compensation", os.path.join(script_dir, "sync_bamboohr_compensation.py")
)
sync_compensation_mod = importlib.util.module_from_spec(spec_comp)
spec_comp.loader.exec_module(sync_compensation_mod)
sync_all_compensation = sync_compensation_mod.sync_all_compensation


def main():
    parser = argparse.ArgumentParser(
        description="Sync all data from BambooHR to MKHub",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Dry run to see what would be synced
  python scripts/sync_bamboohr_all.py --dry-run
  
  # Sync everything
  python scripts/sync_bamboohr_all.py
  
  # Sync only employees and documents
  python scripts/sync_bamboohr_all.py --skip-training --skip-time-off --skip-compensation
  
  # Sync first 10 employees only
  python scripts/sync_bamboohr_all.py --limit 10
        """
    )
    parser.add_argument("--dry-run", action="store_true", help="Don't make any changes")
    parser.add_argument("--skip-employees", action="store_true", help="Skip employee synchronization")
    parser.add_argument("--skip-training", action="store_true", help="Skip training synchronization")
    parser.add_argument("--skip-documents", action="store_true", help="Skip document synchronization")
    parser.add_argument("--skip-time-off", action="store_true", help="Skip time-off / sick leave synchronization")
    parser.add_argument("--skip-compensation", action="store_true", help="Skip compensation / salary history synchronization")
    parser.add_argument("--limit", type=int, help="Limit number of employees to process")
    parser.add_argument("--no-photos", dest="include_photos", action="store_false", help="Skip profile photos in document sync")
    parser.add_argument("--force-update-photos", action="store_true", help="Update profile photos even if they already exist")
    
    args = parser.parse_args()
    
    print("="*70)
    print("BambooHR Full Synchronization")
    print("="*70)
    print(f"Mode: {'DRY RUN' if args.dry_run else 'LIVE'}")
    if args.limit:
        print(f"Limit: {args.limit} employees")
    print("="*70)
    
    # 1. Sync Employees
    if not args.skip_employees:
        print("\n" + "="*70)
        print("STEP 1: Syncing Employees")
        print("="*70)
        try:
            sync_employees(
                dry_run=args.dry_run,
                update_existing=True,
                limit=args.limit
            )
        except Exception as e:
            print(f"\n[ERROR] Error syncing employees: {e}")
            import traceback
            traceback.print_exc()
            if not args.dry_run:
                print("\n[WARN]  Continuing with other syncs...")
    else:
        print("\n[Skipping employee synchronization]")
    
    # 2. Sync Training
    if not args.skip_training:
        print("\n" + "="*70)
        print("STEP 2: Syncing Training Records")
        print("="*70)
        try:
            sync_all_training(
                dry_run=args.dry_run,
                employee_id=None,
                limit=args.limit
            )
        except Exception as e:
            print(f"\n[ERROR] Error syncing training: {e}")
            import traceback
            traceback.print_exc()
            if not args.dry_run:
                print("\n[WARN]  Continuing with other syncs...")
    else:
        print("\n[Skipping training synchronization]")
    
    # 3. Sync Documents
    if not args.skip_documents:
        print("\n" + "="*70)
        print("STEP 3: Syncing Documents")
        print("="*70)
        try:
            sync_all_documents(
                dry_run=args.dry_run,
                employee_id=None,
                include_photos=args.include_photos,
                limit=args.limit,
                force_update_photos=args.force_update_photos
            )
        except Exception as e:
            print(f"\n[ERROR] Error syncing documents: {e}")
            import traceback
            traceback.print_exc()
            if not args.dry_run:
                print("\n[WARN]  Continuing with other syncs...")
    else:
        print("\n[Skipping document synchronization]")

    # 4. Sync Time Off (vacation / sick leave + history)
    if not args.skip_time_off:
        print("\n" + "="*70)
        print("STEP 4: Syncing Time Off (balances, requests, history)")
        print("="*70)
        try:
            sync_all_time_off(
                dry_run=args.dry_run,
                limit=args.limit,
            )
        except Exception as e:
            print(f"\n[ERROR] Error syncing time off: {e}")
            import traceback
            traceback.print_exc()
            if not args.dry_run:
                print("\n[WARN]  Continuing with other syncs...")
    else:
        print("\n[Skipping time-off synchronization]")

    # 5. Sync Compensation / Salary History
    if not args.skip_compensation:
        print("\n" + "="*70)
        print("STEP 5: Syncing Compensation History")
        print("="*70)
        try:
            sync_all_compensation(
                dry_run=args.dry_run,
                limit=args.limit,
            )
        except Exception as e:
            print(f"\n[ERROR] Error syncing compensation history: {e}")
            import traceback
            traceback.print_exc()
    else:
        print("\n[Skipping compensation synchronization]")
    
    print("\n" + "="*70)
    print("Synchronization Complete!")
    print("="*70)


if __name__ == "__main__":
    main()

