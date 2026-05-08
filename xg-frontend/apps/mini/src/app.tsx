import { PropsWithChildren } from 'react';
import AIChatDrawer from './components/AIChatDrawer';
import './app.css';

/* AIChatDrawer 必须挂在 App 层（即每个 page 的根），不能挂在 custom-tab-bar 里。
 * 原因：mini-app 的 custom-tab-bar 在系统专属区域渲染，里面的 position:fixed
 * 会被限制在 tab bar 的可视区域，导致全屏 overlay 失效（看起来"透明"）。
 */
function App({ children }: PropsWithChildren) {
  return (
    <>
      {children}
      <AIChatDrawer />
    </>
  );
}

export default App;
