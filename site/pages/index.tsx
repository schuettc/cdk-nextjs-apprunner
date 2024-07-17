import dynamic from 'next/dynamic';
import React from 'react';
import Layout from '../components/Layout';

const Cards = dynamic(
  () => import('@cloudscape-design/components').then((mod) => mod.Cards),
  { ssr: false },
);
const Box = dynamic(
  () => import('@cloudscape-design/components').then((mod) => mod.Box),
  { ssr: false },
);
const SpaceBetween = dynamic(
  () => import('@cloudscape-design/components').then((mod) => mod.SpaceBetween),
  { ssr: false },
);

interface CardItem {
  name: string;
  description: string;
  value: string;
}

const cardItems: CardItem[] = [
  {
    name: 'Card 1',
    description: 'This is the first card',
    value: 'Value 1',
  },
  {
    name: 'Card 2',
    description: 'This is the second card',
    value: 'Value 2',
  },
  {
    name: 'Card 3',
    description: 'This is the third card',
    value: 'Value 3',
  },
];

const Home: React.FC = () => {
  return (
    <Layout>
      <SpaceBetween size='l'>
        <Box variant='h2'>Dashboard - Version 2</Box>
        <Cards
          cardDefinition={{
            header: (item) => (item as CardItem).name,
            sections: [
              {
                id: 'description',
                header: 'Description',
                content: (item) => (item as CardItem).description,
              },
              {
                id: 'value',
                header: 'Value',
                content: (item) => (item as CardItem).value,
              },
            ],
          }}
          cardsPerRow={[{ cards: 1 }, { minWidth: 500, cards: 2 }]}
          items={cardItems}
        />
      </SpaceBetween>
    </Layout>
  );
};

export default Home;
