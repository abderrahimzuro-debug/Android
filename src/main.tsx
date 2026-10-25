import '@fontsource-variable/plus-jakarta-sans/wght.css';
import '@fontsource-variable/noto-sans-arabic/wght.css';
import '@fontsource/stix-two-math/400.css';
import './styles.css';
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');
createRoot(container).render(<App />);
