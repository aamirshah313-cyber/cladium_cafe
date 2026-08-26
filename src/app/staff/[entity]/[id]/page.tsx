import { notFound } from 'next/navigation';
import { isStaffEntityKey, STAFF_ENTITY_CONFIG } from '../../entity-config';
import { DetailView } from '../../detail-view';

export default async function StaffEntityDetailPage({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const { entity, id } = await params;
  if (!isStaffEntityKey(entity)) notFound();

  return <DetailView config={STAFF_ENTITY_CONFIG[entity]} id={id} />;
}
