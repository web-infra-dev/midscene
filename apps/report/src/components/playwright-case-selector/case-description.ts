const MAX_CASE_DESCRIPTION_LENGTH = 100;

export function getCaseDescription(description: string): string {
  if (description.length > MAX_CASE_DESCRIPTION_LENGTH) {
    return `${description.slice(0, MAX_CASE_DESCRIPTION_LENGTH - 3)}...`;
  }

  return description;
}
