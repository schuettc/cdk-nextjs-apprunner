import { SideNavigationProps } from '@cloudscape-design/components/side-navigation';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import React from 'react';

const AppLayout = dynamic(
  () => import('@cloudscape-design/components').then((mod) => mod.AppLayout),
  { ssr: false },
);
const Container = dynamic(
  () => import('@cloudscape-design/components').then((mod) => mod.Container),
  { ssr: false },
);
const SideNavigation = dynamic(
  () =>
    import('@cloudscape-design/components').then((mod) => mod.SideNavigation),
  { ssr: false },
);

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const router = useRouter();

  const navigationItems: SideNavigationProps.Item[] = [
    { type: 'link', text: 'Home', href: '/' },
    { type: 'link', text: 'About', href: '/about' },
  ];

  return (
    <AppLayout
      navigation={
        <SideNavigation
          header={{ text: 'Demo Site', href: '/' }}
          items={navigationItems.map((item) =>
            item.type === 'link'
              ? { ...item, active: router.pathname === item.href }
              : item,
          )}
        />
      }
      content={<Container>{children}</Container>}
    />
  );
};

export default Layout;
