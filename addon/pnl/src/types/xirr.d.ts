declare module 'xirr' {
  export interface XirrTransaction {
    amount: number;
    when: Date;
  }

  export default function xirr(transactions: XirrTransaction[], guess?: number): number | null;
}
