declare module '@date/holidays-us' {
  interface Holidays {
    /**
     * Check if a given date is a US holiday
     * @param date - The date to check
     * @returns true if the date is a US holiday, false otherwise
     */
    isHoliday(date: Date): boolean;

    /**
     * Get a filtered instance with only bank holidays
     * @returns A Holidays instance that only checks bank holidays
     */
    bank(): Holidays;

    /**
     * Get a filtered instance with only public holidays
     * @returns A Holidays instance that only checks public holidays
     */
    public(): Holidays;
  }

  const holidays: Holidays;
  export default holidays;
}
