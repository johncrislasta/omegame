export type GameType = "tic-tac-toe" | "rock-paper-scissors" | null;

export interface GameState {
  gameType: GameType;
  board?: (string | null)[];
  currentPlayer?: "X" | "O";
  winner?: string | null;
  rpsChoice?: "rock" | "paper" | "scissors" | null;
  rpsOpponentChoice?: "rock" | "paper" | "scissors" | null;
  rpsResult?: "win" | "lose" | "draw" | null;
}

export interface ChatMessage {
  id: string;
  text: string;
  sender: "me" | "stranger";
  timestamp: number;
}

export interface MatchEvent {
  type: "waiting" | "matched" | "connecting" | "connected" | "disconnected" | "strangerDisconnected";
  partnerId?: string;
}
