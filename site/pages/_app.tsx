import type { AppProps } from 'next/app';
import '@cloudscape-design/global-styles/index.css';

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

export default MyApp;
