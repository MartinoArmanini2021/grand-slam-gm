import { useLiveFeed } from '../data/useLiveFeed';

// Headless: runs the live draw/results feed for EVERY signed-in session, so the bracket +
// results populate for all users. Previously only AdminPage synced the feed, which left every
// non-admin with a permanently empty draw. Polls on the tournament's interval (5 min) and
// syncs once on mount; no-ops entirely outside live mode.
export default function LiveFeed() {
  useLiveFeed(true);
  return null;
}
