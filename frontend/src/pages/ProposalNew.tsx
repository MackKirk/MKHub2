import { useLocation } from 'react-router-dom';
import ProposalForm from '@/components/ProposalForm';

export default function ProposalNew(){
  const loc = useLocation();
  const qp = new URLSearchParams(loc.search);
  const clientId = qp.get('client_id')||'';
  const siteId = qp.get('site_id')||'';
  const projectId = qp.get('project_id')||'';

  return <ProposalForm mode="new" clientId={clientId} siteId={siteId} projectId={projectId} />;
}


