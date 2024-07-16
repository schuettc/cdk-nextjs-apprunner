import dynamic from 'next/dynamic';
import React from 'react';
import Layout from '../components/Layout';

const ContentLayout = dynamic(
  () =>
    import('@cloudscape-design/components').then((mod) => mod.ContentLayout),
  { ssr: false },
);
const SpaceBetween = dynamic(
  () => import('@cloudscape-design/components').then((mod) => mod.SpaceBetween),
  { ssr: false },
);
const Container = dynamic(
  () => import('@cloudscape-design/components').then((mod) => mod.Container),
  { ssr: false },
);
const Header = dynamic(
  () => import('@cloudscape-design/components').then((mod) => mod.Header),
  { ssr: false },
);
const Box = dynamic(
  () => import('@cloudscape-design/components').then((mod) => mod.Box),
  { ssr: false },
);
const ColumnLayout = dynamic(
  () => import('@cloudscape-design/components').then((mod) => mod.ColumnLayout),
  { ssr: false },
);

const About: React.FC = () => {
  return (
    <Layout>
      <ContentLayout
        header={
          <SpaceBetween size='m'>
            <Header variant='h1'>About Our Project</Header>
            <Box variant='p'>
              Learn more about our NextJS app deployed with CDK to AWS App
              Runner
            </Box>
          </SpaceBetween>
        }
      >
        <Container>
          <SpaceBetween size='l'>
            <ColumnLayout columns={2} variant='text-grid'>
              <div>
                <Box variant='h2'>Our Mission</Box>
                <Box variant='p'>
                  Our mission is to demonstrate the power of combining NextJS,
                  AWS CDK, and App Runner to create scalable and efficient web
                  applications.
                </Box>
              </div>
              <div>
                <Box variant='h2'>Technologies Used</Box>
                <ul>
                  <li>NextJS</li>
                  <li>AWS CDK</li>
                  <li>App Runner</li>
                  <li>Cloudscape Design System</li>
                </ul>
              </div>
            </ColumnLayout>
            <Box variant='h2'>Why This Stack?</Box>
            <Box variant='p'>
              This technology stack provides a powerful combination of frontend
              performance, infrastructure as code, and simplified deployment.
              NextJS offers server-side rendering and optimal performance, CDK
              allows us to define our infrastructure using familiar programming
              languages, and App Runner provides a fully managed environment for
              running web applications.
            </Box>
          </SpaceBetween>
        </Container>
      </ContentLayout>
    </Layout>
  );
};

export default About;
