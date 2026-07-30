import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useGameStore } from '../store/gameStore';
import { track } from '../data/analytics';

// Safety net: if a render ever throws (e.g. persisted state referencing a player
// id that no longer exists after a roster change), show a recovery screen with a
// one-tap game reset instead of a blank white page.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the crash so a field failure isn't silent (and is available to any
    // error-reporting integration added later).
    console.error('[GrandSlamGM] render error caught by ErrorBoundary:', error, info.componentStack);
    track('app_error', { message: error.message });
  }

  handleReset = () => {
    try { useGameStore.getState().resetGame(); } catch { /* ignore */ }
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--bg)' }}>
          <div className="w-full text-center rounded-2xl p-8" style={{ maxWidth: 420, background: '#FFFFFF', border: '1px solid rgba(10,27,51,0.1)', boxShadow: '0 12px 40px rgba(10,27,51,0.14)' }}>
            <div className="text-4xl mb-3">🎾</div>
            <h1 className="text-lg font-extrabold mb-1" style={{ color: 'var(--ink)' }}>Something went off court</h1>
            <p className="text-sm mb-5" style={{ color: 'var(--ink-2)' }}>
              We hit a snag loading your game. Resetting your squad will get you back on court — your login stays intact.
            </p>
            <button
              onClick={this.handleReset}
              className="px-5 py-2.5 rounded-xl font-bold text-sm text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--blue)' }}
            >
              Reset my game
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
