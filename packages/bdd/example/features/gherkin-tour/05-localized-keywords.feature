# language: de
# The `# language:` header (first line of the file) switches every KEYWORD
# to another spoken language — here German: Funktionalität = Feature,
# Szenario = Scenario, Angenommen/Wenn/Dann = Given/When/Then. Around 70
# languages ship with Gherkin. Only the keywords change; the step text is
# whatever you write — kept in English here so the same vision agent
# instructions run unchanged.
@tour
Funktionalität: Gherkin tour — localized keywords

  Szenario: German keywords drive the same English prompts
    Angenommen I open the demo shop home page
    Wenn I add the "Camp Mug" product to the cart
    Dann the cart shows the "Camp Mug" product
