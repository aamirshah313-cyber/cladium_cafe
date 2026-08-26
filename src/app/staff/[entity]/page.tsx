import { notFound } from 'next/navigation';
import { isStaffEntityKey, STAFF_ENTITY_CONFIG } from '../entity-config';
import { QueueView } from '../queue-view';

export default async function StaffEntityQueuePage({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity } = await params;
  if (!isStaffEntityKey(entity)) notFound();

  return <QueueView config={STAFF_ENTITY_CONFIG[entity]} />;
}
