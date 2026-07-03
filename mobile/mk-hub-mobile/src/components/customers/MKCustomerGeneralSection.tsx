import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MKCard } from "../MKCard";
import { formatCustomerAddress } from "../../lib/customerUi";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import type { Customer } from "../../types/customers";

interface MKCustomerGeneralSectionProps {
  customer: Customer;
}

export const MKCustomerGeneralSection: React.FC<MKCustomerGeneralSectionProps> = ({
  customer
}) => {
  const address = formatCustomerAddress(customer);
  const billingAddress = [
    customer.billing_address_line1,
    customer.billing_address_line2,
    [customer.billing_city, customer.billing_province].filter(Boolean).join(", "),
    customer.billing_postal_code,
    customer.billing_country
  ]
    .filter((part) => String(part || "").trim())
    .join(" - ");

  return (
    <View style={styles.stack}>
      <MKCard style={styles.card}>
        <Text style={styles.sectionTitle}>Company</Text>
        <InfoField label="Display name" value={customer.display_name} />
        <InfoField label="Legal name" value={customer.legal_name} />
        <InfoField label="Type" value={customer.client_type} />
        <InfoField label="Lead source" value={customer.lead_source} />
        <InfoField label="Description" value={customer.description} multiline />
      </MKCard>

      <MKCard style={styles.card}>
        <Text style={styles.sectionTitle}>Address</Text>
        <InfoField label="Primary address" value={address} multiline />
        <InfoField
          label="Billing same as address"
          value={customer.billing_same_as_address ? "Yes" : "No"}
        />
        <InfoField label="Billing address" value={billingAddress} multiline />
      </MKCard>

      <MKCard style={styles.card}>
        <Text style={styles.sectionTitle}>Billing</Text>
        <InfoField label="Billing email" value={customer.billing_email} />
        <InfoField label="PO required" value={customer.po_required ? "Yes" : "No"} />
        <InfoField label="Tax number" value={customer.tax_number} />
      </MKCard>
    </View>
  );
};

function InfoField({
  label,
  value,
  multiline
}: {
  label: string;
  value?: string | null;
  multiline?: boolean;
}) {
  return (
    <View style={styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={multiline ? 0 : 1}>
        {String(value || "").trim() || "-"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md
  },
  card: {
    gap: spacing.md
  },
  sectionTitle: {
    ...typography.body,
    fontFamily: typography.button.fontFamily,
    color: colors.textPrimary
  },
  infoField: {
    gap: 2
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: "uppercase"
  },
  infoValue: {
    ...typography.bodySmall,
    color: colors.textPrimary
  }
});
