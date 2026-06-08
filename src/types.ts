import { Timestamp } from 'firebase/firestore';

export type GroupType = 'personal' | 'household' | 'trip' | 'other';
export type SplitType = 'equal' | 'percentage' | 'exact';
export type MemberRole = 'admin' | 'member';
export type BudgetType = 'weekly' | 'monthly' | 'total';

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: Timestamp;
}

export interface FieldNote {
  id: string;
  author: string;
  role: string;
  content: string;
  timestamp: Timestamp;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: Timestamp;
  type: GroupType;
  memberIds: string[];
  maxBudget?: number;
  budgetType?: BudgetType;
  notes?: FieldNote[]; // real-time field notes
  checklist?: { id: string; text: string; checked: boolean }[]; // synchronized safety protocols
}

export interface GroupMember {
  uid: string;
  role: MemberRole;
  joinedAt: Timestamp;
  displayName?: string;
  email?: string;
}

export interface Expense {
  id: string;
  amount: number; // Represents: approximate infected area in square meters or number of objects
  description: string;
  category: string;
  paidBy: string; // reporter userId
  date: Timestamp;
  createdAt: Timestamp;
  splitType: SplitType;
}

export const CATEGORIES = [
  'لغم أرضي مضاد للأفراد',
  'لغم مضاد للدبابات والآليات',
  'ذخائر وقذائف غير منفجرة',
  'عبوة ناسفة مبتكرة',
  'مخلفات حرب خطرة وتطهير',
  'بلاغ مواطن مشبوه',
  'مهمة فحص ميداني وتوعية',
  'أخرى / عام'
];
