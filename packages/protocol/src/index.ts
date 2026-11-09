export type PlayerId = string;
export type CardType = 'character' | 'tactic' | 'item';
export type CardSubtype = 'normal' | 'instant' | 'equipment' | 'support';
export type Attribute = 'fire' | 'lightning' | 'dark' | 'ice' | 'physical' | 'void' | 'none';
export type SignalColor = 'red' | 'blue' | 'yellow';
export type Phase = 'mulligan' | 'upright' | 'draw' | 'energy' | 'main' | 'end';

export interface CardDefinition {
  id: string;
  name: string;
  type: CardType;
  subtype?: CardSubtype;
  cost: number;
  attribute: Attribute;
  traits: string[];
  pp?: number;
  dp?: number;
  signal?: SignalColor;
  text: string[];
  effectIds: string[];
  artPath?: string;
}

export interface DeckDefinition {
  id: string;
  name: string;
  developmentOnly: boolean;
  cards: string[];
}

export interface CardInstance {
  instanceId: string;
  cardId: string;
  face: 'up' | 'down';
  rested: boolean;
  enteredTurn?: number;
  frozen?: boolean;
  temporaryPp?: number;
  temporaryDp?: number;
  attached?: CardInstance[];
}

export interface PendingAttack {
  attackerSlot: number;
  target: 'player' | 'character';
  targetSlot?: number;
  blockerSlot?: number;
  priorityPlayerId: PlayerId;
  consecutivePasses: number;
}

export interface PlayerState {
  id: PlayerId;
  deck: CardInstance[];
  hand: CardInstance[];
  graveyard: CardInstance[];
  processing: CardInstance[];
  field: Array<CardInstance | null>;
  signals: CardInstance[];
  energy: CardInstance[];
  corruption: number;
  mulliganDone: boolean;
}

export interface GameEvent {
  id: number;
  type: string;
  playerId?: PlayerId;
  message: string;
  public: boolean;
  createdAtTurn: number;
}

export interface GameState {
  id: string;
  version: number;
  status: 'playing' | 'paused' | 'finished';
  players: Record<PlayerId, PlayerState>;
  playerOrder: [PlayerId, PlayerId];
  activePlayerId: PlayerId;
  phase: Phase;
  turn: number;
  pendingAttack: PendingAttack | null;
  winnerId: PlayerId | null;
  processedCommandIds: string[];
  events: GameEvent[];
}

export interface CommandBase {
  commandId: string;
  playerId: PlayerId;
  expectedVersion: number;
}

export type GameCommand = CommandBase & (
  | { type: 'MULLIGAN'; instanceIds: string[] }
  | { type: 'ADVANCE_PHASE' }
  | { type: 'SET_ENERGY'; instanceId?: string }
  | { type: 'PLAY_CARD'; instanceId: string; fieldSlot?: number; targetSlot?: number; paymentIds?: string[] }
  | { type: 'ELIMINATE_SIGNALS'; startIndex: number }
  | { type: 'ACTIVATE_ABILITY'; sourceInstanceId: string; abilityIndex: number; targetInstanceIds?: string[] }
  | { type: 'DECLARE_ATTACK'; attackerSlot: number; target: 'player' | 'character'; targetSlot?: number }
  | { type: 'BLOCK'; blockerSlot: number }
  | { type: 'PASS_RESPONSE' }
  | { type: 'SELECT_OPTION'; optionId: string }
  | { type: 'END_PHASE' }
  | { type: 'CONCEDE' }
);

export type LegalAction = GameCommand extends infer Command
  ? Command extends CommandBase
    ? Omit<Command, keyof CommandBase>
    : never
  : never;

export interface CommandRejection {
  code: 'STALE_VERSION' | 'DUPLICATE_COMMAND' | 'NOT_YOUR_ACTION' | 'ILLEGAL_ACTION' | 'GAME_FINISHED';
  message: string;
}

export interface GameResult {
  accepted: boolean;
  state: GameState;
  legalActions: LegalAction[];
  emittedEvents: GameEvent[];
  rejection?: CommandRejection;
}

export interface HiddenZoneView { count: number }
export interface PublicCardView extends Omit<CardInstance, 'cardId' | 'attached'> {
  cardId: string | null;
  attached?: PublicCardView[];
}

export interface PlayerBoardView {
  id: PlayerId;
  hand: CardInstance[] | HiddenZoneView;
  deck: HiddenZoneView;
  graveyard: PublicCardView[];
  processing: PublicCardView[];
  field: Array<PublicCardView | null>;
  signals: PublicCardView[];
  energy: PublicCardView[];
  corruption: number;
}

export interface PlayerView {
  gameId: string;
  version: number;
  status: GameState['status'];
  viewerId: PlayerId;
  self: PlayerBoardView;
  opponent: PlayerBoardView;
  activePlayerId: PlayerId;
  phase: Phase;
  turn: number;
  pendingAttack: PendingAttack | null;
  winnerId: PlayerId | null;
  legalActions: LegalAction[];
  events: GameEvent[];
}

export interface RoomSeat { playerId: PlayerId; connected: boolean; ready: boolean; }
export interface RoomSnapshot {
  code: string;
  status: 'waiting' | 'playing' | 'paused' | 'finished';
  seats: RoomSeat[];
  viewerId: PlayerId;
  game?: PlayerView;
}

export interface RoomCredentials { code: string; playerId: PlayerId; token: string; }

export interface ServerToClientEvents {
  'room:snapshot': (snapshot: RoomSnapshot) => void;
  'game:snapshot': (snapshot: PlayerView) => void;
  'game:events': (events: GameEvent[]) => void;
  'command:rejected': (rejection: CommandRejection) => void;
  'opponent:connection': (connected: boolean) => void;
}

export interface ClientToServerEvents {
  'room:resume': (credentials: RoomCredentials) => void;
  'room:ready': (ready: boolean) => void;
  'game:command': (command: GameCommand) => void;
  'game:concede': () => void;
}
