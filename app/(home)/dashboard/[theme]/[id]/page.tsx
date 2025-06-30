import ThemePageClient from './theme-page-client';

const ThemePage = async ({
  params,
}: {
  params: Promise<{ theme: string; id: string }>;
}) => {
  const { theme, id } = await params;

  return <ThemePageClient theme={theme} />;
};

export default ThemePage;
