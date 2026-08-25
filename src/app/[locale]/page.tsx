import { notFound } from 'next/navigation';
import { chromeText } from '../../lib/i18n/chrome';
import { isSupportedLocale } from '../../lib/i18n/locale';

export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: rawLocale } = await params;
  if (!isSupportedLocale(rawLocale)) notFound();
  const locale = rawLocale;

  return (
    <>
      <h1>Cladium Café &amp; Resort</h1>
      <p>{chromeText('homeIntro', locale)}</p>
    </>
  );
}
