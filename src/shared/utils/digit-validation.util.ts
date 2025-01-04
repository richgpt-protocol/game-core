export const isValidSixDigitPairs = (input: string): boolean => {
  // Regex: Match exactly 6 digits (2 valid pairs).
  const regex = /^\d{6}$/;
  return regex.test(input);
};
