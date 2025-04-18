import * as Z from 'zustand';

const { create } = Z;

// History local storage key
const HISTORY_KEY = 'midscene-prompt-history';

export interface HistoryItem {
  type: 'aiAction' | 'aiQuery' | 'aiAssert' | 'aiTap';
  prompt: string;
  timestamp: number;
}

// Function to get history from localStorage
const getHistoryFromLocalStorage = (): HistoryItem[] => {
  const historyString = localStorage.getItem(HISTORY_KEY);
  return historyString ? JSON.parse(historyString) : [];
};

// Create the history store
export const useHistoryStore = create<{
  history: HistoryItem[];
  clearHistory: () => void;
  addHistory: (history: HistoryItem) => void;
}>((set, get) => ({
  history: getHistoryFromLocalStorage(),

  clearHistory: () => {
    set({ history: [] });
    localStorage.removeItem(HISTORY_KEY);
  },

  addHistory: (historyItem) => {
    const newHistory = [
      historyItem,
      ...get().history.filter((h) => h.prompt !== historyItem.prompt),
    ];

    // Limit history to 10 items
    while (newHistory.length > 10) {
      newHistory.pop();
    }

    set({ history: newHistory });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
  },
}));
