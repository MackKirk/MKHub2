import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import {
  CommonActions,
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../hooks/useAuth";
import { useHubMenu } from "../../navigation/HubMenuProvider";
import { hasPermission } from "../../lib/permissions";
import { customerDisplayName, formatCustomerStatus } from "../../lib/customerUi";
import { CustomerContactFormModal } from "../../components/customers/CustomerContactFormModal";
import { CustomerFormModal } from "../../components/customers/CustomerFormModal";
import {
  CustomerDetailTabItem,
  customerDetailTabBarHeight,
  MKCustomerDetailTabBar
} from "../../components/customers/MKCustomerDetailTabBar";
import { CustomerSiteFormModal } from "../../components/customers/CustomerSiteFormModal";
import { MKCustomerContactsSection } from "../../components/customers/MKCustomerContactsSection";
import { MKCustomerGeneralSection } from "../../components/customers/MKCustomerGeneralSection";
import { MKCustomerHero } from "../../components/customers/MKCustomerHero";
import { MKCustomerProjectsSection } from "../../components/customers/MKCustomerProjectsSection";
import { MKCustomerSitesSection } from "../../components/customers/MKCustomerSitesSection";
import { MKPageHeader } from "../../components/MKPageHeader";
import { ScreenLayout } from "../../components/ScreenLayout";
import {
  createCustomerContact,
  createCustomerSite,
  deleteCustomerContact,
  deleteCustomerSite,
  getCustomer,
  getCustomerProjectParticipations,
  listCustomerContacts,
  listCustomerSites,
  updateCustomer,
  updateCustomerContact,
  updateCustomerSite
} from "../../services/customers";
import { toApiError } from "../../services/api";
import type { RootStackParamList } from "../../navigation/types";
import type {
  Customer,
  CustomerContact,
  CustomerContactPayload,
  CustomerDetailTabKey,
  CustomerPayload,
  CustomerProjectParticipation,
  CustomerProjectParticipationsResponse,
  CustomerSite,
  CustomerSitePayload
} from "../../types/customers";
import type { ProjectListItem } from "../../types/projects";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";

type CustomerDetailRoute = RouteProp<RootStackParamList, "CustomerDetail">;
type CustomerDetailNav = NativeStackNavigationProp<RootStackParamList, "CustomerDetail">;

const CUSTOMER_TABS: CustomerDetailTabItem[] = [
  { key: "general", label: "General", icon: "grid-outline" },
  { key: "contacts", label: "Contacts", icon: "people-outline" },
  { key: "sites", label: "Sites", icon: "business-outline" },
  { key: "projects", label: "Projects", icon: "folder-open-outline" }
];

const emptyParticipation: CustomerProjectParticipationsResponse = {
  rollup: [],
  related_memberships: []
};

export const CustomerDetailScreen: React.FC = () => {
  const route = useRoute<CustomerDetailRoute>();
  const navigation = useNavigation<CustomerDetailNav>();
  const { openMenu } = useHubMenu();
  const { permissions, roles } = useAuth();
  const permissionsSet = useMemo(() => new Set(permissions), [permissions]);
  const insets = useSafeAreaInsets();
  const bottomTabHeight = customerDetailTabBarHeight(insets.bottom);

  const [activeTab, setActiveTab] = useState<CustomerDetailTabKey>(
    route.params.initialTab ?? "general"
  );
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [contacts, setContacts] = useState<CustomerContact[]>([]);
  const [sites, setSites] = useState<CustomerSite[]>([]);
  const [participation, setParticipation] =
    useState<CustomerProjectParticipationsResponse>(emptyParticipation);
  const [loading, setLoading] = useState(true);
  const [relationsLoading, setRelationsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [customerFormOpen, setCustomerFormOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [siteFormOpen, setSiteFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null);
  const [editingSite, setEditingSite] = useState<CustomerSite | null>(null);

  const canEditGeneral = hasPermission(
    permissionsSet,
    roles,
    "business:customers:general:write"
  );
  const canEditContacts = hasPermission(
    permissionsSet,
    roles,
    "business:customers:contacts:write"
  );
  const canEditSites = hasPermission(
    permissionsSet,
    roles,
    "business:customers:sites:write"
  );

  const loadCustomer = useCallback(async () => {
    const data = await getCustomer(route.params.customerId);
    setCustomer(data);
    return data;
  }, [route.params.customerId]);

  const loadRelations = useCallback(async () => {
    setRelationsLoading(true);
    try {
      const [contactRows, siteRows, projectRows] = await Promise.all([
        listCustomerContacts(route.params.customerId).catch(() => []),
        listCustomerSites(route.params.customerId).catch(() => []),
        getCustomerProjectParticipations(route.params.customerId).catch(() => emptyParticipation)
      ]);
      setContacts(contactRows);
      setSites(siteRows);
      setParticipation(projectRows);
    } finally {
      setRelationsLoading(false);
    }
  }, [route.params.customerId]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      await loadCustomer();
      await loadRelations();
    } catch (err) {
      Alert.alert("Could not load customer", toApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [loadCustomer, loadRelations]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleCustomerSubmit = async (payload: CustomerPayload) => {
    if (!customer) return;
    try {
      setSubmitting(true);
      const updated = await updateCustomer(customer.id, payload);
      setCustomer(updated);
      setCustomerFormOpen(false);
    } catch (err) {
      Alert.alert("Could not update customer", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleContactSubmit = async (payload: CustomerContactPayload) => {
    if (!customer) return;
    try {
      setSubmitting(true);
      if (editingContact) {
        await updateCustomerContact(customer.id, editingContact.id, payload);
      } else {
        await createCustomerContact(customer.id, payload);
      }
      setContactFormOpen(false);
      setEditingContact(null);
      setContacts(await listCustomerContacts(customer.id));
    } catch (err) {
      Alert.alert("Could not save contact", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteContact = (contact: CustomerContact) => {
    if (!customer) return;
    Alert.alert("Delete contact", `Delete ${contact.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setSubmitting(true);
            await deleteCustomerContact(customer.id, contact.id);
            setContacts(await listCustomerContacts(customer.id));
          } catch (err) {
            Alert.alert("Could not delete contact", toApiError(err).message);
          } finally {
            setSubmitting(false);
          }
        }
      }
    ]);
  };

  const handleSiteSubmit = async (payload: CustomerSitePayload) => {
    if (!customer) return;
    try {
      setSubmitting(true);
      if (editingSite) {
        await updateCustomerSite(customer.id, editingSite.id, payload);
      } else {
        await createCustomerSite(customer.id, payload);
      }
      setSiteFormOpen(false);
      setEditingSite(null);
      setSites(await listCustomerSites(customer.id));
    } catch (err) {
      Alert.alert("Could not save site", toApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteSite = (site: CustomerSite) => {
    if (!customer) return;
    Alert.alert("Delete site", `Delete ${site.site_name || "this site"}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setSubmitting(true);
            await deleteCustomerSite(customer.id, site.id);
            setSites(await listCustomerSites(customer.id));
          } catch (err) {
            Alert.alert("Could not delete site", toApiError(err).message);
          } finally {
            setSubmitting(false);
          }
        }
      }
    ]);
  };

  const openProject = (project: CustomerProjectParticipation) => {
    const projectItem: ProjectListItem = {
      id: project.id,
      code: project.code ?? "",
      name: project.name,
      client_id: customer?.id,
      created_at: project.created_at ?? undefined,
      date_start: project.date_start ?? undefined,
      date_end: project.date_end ?? undefined,
      date_eta: project.date_eta ?? undefined,
      progress: project.progress ?? undefined,
      status_label: project.status_label ?? undefined,
      is_bidding: Boolean(project.is_bidding),
      business_line: project.business_line ?? undefined,
      service_value: project.service_value ?? undefined,
      cost_actual: null
    };
    navigation.dispatch(
      CommonActions.navigate({
        name: "ProjectDetail",
        params: { project: projectItem }
      })
    );
  };

  const renderTabContent = () => {
    if (!customer) return null;
    switch (activeTab) {
      case "contacts":
        return (
          <MKCustomerContactsSection
            contacts={contacts}
            loading={relationsLoading}
            canEdit={canEditContacts}
            onCreate={() => {
              setEditingContact(null);
              setContactFormOpen(true);
            }}
            onEdit={(contact) => {
              setEditingContact(contact);
              setContactFormOpen(true);
            }}
            onDelete={handleDeleteContact}
          />
        );
      case "sites":
        return (
          <MKCustomerSitesSection
            sites={sites}
            loading={relationsLoading}
            canEdit={canEditSites}
            onCreate={() => {
              setEditingSite(null);
              setSiteFormOpen(true);
            }}
            onEdit={(site) => {
              setEditingSite(site);
              setSiteFormOpen(true);
            }}
            onDelete={handleDeleteSite}
          />
        );
      case "projects":
        return (
          <MKCustomerProjectsSection
            rollup={participation.rollup}
            relatedMemberships={participation.related_memberships}
            loading={relationsLoading}
            onOpenProject={openProject}
          />
        );
      case "general":
      default:
        return <MKCustomerGeneralSection customer={customer} />;
    }
  };

  return (
    <ScreenLayout scroll={false} contentStyle={styles.screenContent}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: bottomTabHeight + spacing.lg }
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <MKPageHeader
          title={customer ? customerDisplayName(customer) : route.params.title ?? "Customer"}
          subtitle={customer ? formatCustomerStatus(customer.client_status) : "Loading..."}
          onBack={() => navigation.goBack()}
          onMenu={openMenu}
        />

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : customer ? (
          <>
            <MKCustomerHero
              customer={customer}
              canEdit={canEditGeneral}
              onEdit={() => setCustomerFormOpen(true)}
            />
            <View style={styles.tabContent}>{renderTabContent()}</View>
          </>
        ) : (
          <View style={styles.loading}>
            <Text>Customer not found.</Text>
          </View>
        )}
      </ScrollView>

      <MKCustomerDetailTabBar
        tabs={CUSTOMER_TABS}
        activeKey={activeTab}
        onChange={setActiveTab}
        style={styles.bottomTabBar}
      />

      <CustomerFormModal
        visible={customerFormOpen}
        customer={customer}
        loading={submitting}
        onClose={() => setCustomerFormOpen(false)}
        onSubmit={handleCustomerSubmit}
      />
      <CustomerContactFormModal
        visible={contactFormOpen}
        contact={editingContact}
        loading={submitting}
        onClose={() => {
          setContactFormOpen(false);
          setEditingContact(null);
        }}
        onSubmit={handleContactSubmit}
      />
      <CustomerSiteFormModal
        visible={siteFormOpen}
        site={editingSite}
        loading={submitting}
        onClose={() => {
          setSiteFormOpen(false);
          setEditingSite(null);
        }}
        onSubmit={handleSiteSubmit}
      />
    </ScreenLayout>
  );
};

const styles = StyleSheet.create({
  screenContent: {
    flex: 1
  },
  scrollView: {
    flex: 1
  },
  scrollContent: {
    gap: spacing.md
  },
  tabContent: {
    marginTop: spacing.md
  },
  bottomTabBar: {
    marginHorizontal: -spacing.xl,
    marginBottom: -spacing.xl
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
    justifyContent: "center"
  }
});
