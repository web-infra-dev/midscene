import { describe, expect, it } from 'vitest';

describe('XPath String Escaping', () => {
  it('should properly escape XPath strings with single quotes using JSON.stringify', () => {
    // This is the problematic XPath that was causing issues
    const xpathWithSingleQuotes = "//div[@class='xxx']/span[@class='xxx'][text()='xxx']";
    
    // Old problematic approach (would break)
    const oldApproach = `getElementInfoByXpath('${xpathWithSingleQuotes}')`;
    
    // New safe approach using JSON.stringify
    const newApproach = `getElementInfoByXpath(${JSON.stringify(xpathWithSingleQuotes)})`;
    
    // The old approach would create invalid JavaScript
    expect(oldApproach).toBe("getElementInfoByXpath('//div[@class='xxx']/span[@class='xxx'][text()='xxx']')");
    
    // The new approach creates valid JavaScript with proper escaping
    expect(newApproach).toBe('getElementInfoByXpath("//div[@class=\'xxx\']/span[@class=\'xxx\'][text()=\'xxx\']")');
    
    // Verify the new approach produces valid JavaScript that could be evaluated
    expect(() => new Function(newApproach)).not.toThrow();
  });

  it('should handle XPath strings with double quotes', () => {
    const xpathWithDoubleQuotes = '//div[@class="xxx"]/span[@class="xxx"][text()="xxx"]';
    
    const safeExpression = `getElementInfoByXpath(${JSON.stringify(xpathWithDoubleQuotes)})`;
    
    expect(safeExpression).toBe('getElementInfoByXpath("//div[@class=\\"xxx\\"]/span[@class=\\"xxx\\"][text()=\\"xxx\\"]")');
    expect(() => new Function(safeExpression)).not.toThrow();
  });

  it('should handle XPath strings with mixed quotes', () => {
    const xpathWithMixedQuotes = `//div[@class='outer']/span[@title="inner's content"][text()='test']`;
    
    const safeExpression = `getElementInfoByXpath(${JSON.stringify(xpathWithMixedQuotes)})`;
    
    // Should properly escape both single and double quotes
    expect(() => new Function(safeExpression)).not.toThrow();
  });

  it('should handle IDs with special characters', () => {
    const idWithSpecialChars = "id-with-'quotes'-and-\"double\"-quotes";
    
    const safeExpression = `getXpathsById(${JSON.stringify(idWithSpecialChars)})`;
    
    expect(() => new Function(safeExpression)).not.toThrow();
  });
});