/**
 * @deprecated Import from `@/components/ui` — `AppHierarchicalSelectSingle` / `AppHierarchicalSelectMulti`.
 * Kept for existing Safety form imports; maps legacy prop names to design-system components.
 */
import {
  AppHierarchicalSelectMulti,
  AppHierarchicalSelectSingle,
  type AppHierarchicalLeafOption,
  type AppHierarchicalTreeNode,
} from '@/components/ui/AppHierarchicalSelect';
import { type FormCustomListTreeNode } from '@/utils/customListTree';

type LeafRow = AppHierarchicalLeafOption;

type SingleProps = {
  label: string;
  hideLabel?: boolean;
  items: FormCustomListTreeNode[];
  leafOptions: LeafRow[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  emptyLabel?: string;
  placeholder?: string;
};

export function SafetyHierarchicalCustomListSingle({
  emptyLabel = 'Select One',
  placeholder,
  ...props
}: SingleProps) {
  return (
    <AppHierarchicalSelectSingle
      {...props}
      placeholder={placeholder ?? emptyLabel}
    />
  );
}

type MultiProps = {
  label: string;
  hideLabel?: boolean;
  items: FormCustomListTreeNode[];
  leafOptions: LeafRow[];
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  emptyLabel?: string;
  placeholder?: string;
};

export function SafetyHierarchicalCustomListMulti({
  emptyLabel = 'Select Multiple',
  placeholder,
  ...props
}: MultiProps) {
  return (
    <AppHierarchicalSelectMulti
      {...props}
      placeholder={placeholder ?? emptyLabel}
    />
  );
}

export type { AppHierarchicalTreeNode };
