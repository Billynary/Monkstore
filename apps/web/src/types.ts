export interface Traits {
  background: string;
  fur: string;
  headgear: string;
  prop: string;
}

export interface Nft {
  id: string;
  name: string;
  image: string | null;
  rarity: string;
  price: number;
  traits: Traits | null;
}

export interface User {
  id: string;
  username: string;
  email: string;
  isAdmin?: boolean;
}

export interface CartLine {
  id: string;
  name: string;
  image: string | null;
  price: number;
  quantity: number;
}

export interface InventoryItem extends Nft {
  ownershipId: string;
  acquiredAt: string;
}

export interface Transaction {
  id: string;
  type: 'PURCHASE' | 'DEPOSIT' | 'REFUND';
  amount: number;
  nftId: string | null;
  status: string;
  reference: string | null;
  createdAt: string;
}

export interface Review {
  id: number;
  nftId: string;
  author: string;
  content: string;
  createdAt: string;
}
