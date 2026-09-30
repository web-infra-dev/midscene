package com.midscene.android;

import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/**
 * The credentials file is written by the Settings form and read by the agent process.
 * These tests pin the round trip, because a value that survives one side and not the
 * other is exactly how "saved" turns into a puzzling "Invalid URL" at run time.
 */
public class ModelEnvFileTest {

    @Test
    public void parsesTheShapesHandWrittenFilesArriveIn() {
        String text = "# a comment\n"
                + "\n"
                + "export MIDSCENE_MODEL_API_KEY=\"sk-quoted\"\n"
                + "MIDSCENE_MODEL_BASE_URL: https://example.com/v1\n"
                + "MIDSCENE_MODEL_NAME='qwen3-vl-plus'\n"
                + "FEATURE_FLAG=true # trailing notes stay in the value\n";

        Map<String, String> entries = ModelEnvFile.parse(text).entries;

        assertEquals("sk-quoted", entries.get("MIDSCENE_MODEL_API_KEY"));
        assertEquals("https://example.com/v1", entries.get("MIDSCENE_MODEL_BASE_URL"));
        assertEquals("qwen3-vl-plus", entries.get("MIDSCENE_MODEL_NAME"));
        assertEquals("true # trailing notes stay in the value", entries.get("FEATURE_FLAG"));
    }

    @Test
    public void reportsUnreadableAndInvalidLinesSeparately() {
        ModelEnvFile.Content content = ModelEnvFile.parse("just some prose\n2BAD=x\nA=1\n");

        assertEquals(1, content.unreadableLines);
        assertEquals(1, content.invalidKeyLines);
        assertEquals(1, content.entries.size());
    }

    @Test
    public void setValueKeepsCommentsBlankLinesAndUnknownKeys() {
        String text = "# keep me\nOTHER_KEY=1\n\nMIDSCENE_MODEL_NAME=old\n";

        String updated = ModelEnvFile.setValue(text, "MIDSCENE_MODEL_NAME", "qwen3-vl-plus");

        assertEquals("# keep me\nOTHER_KEY=1\n\nMIDSCENE_MODEL_NAME=qwen3-vl-plus\n", updated);
    }

    @Test
    public void setValueAppendsBeforeTheTrailingNewline() {
        String updated = ModelEnvFile.setValue("# only a comment\n", "MIDSCENE_MODEL_API_KEY", "sk-1");

        assertEquals("# only a comment\nMIDSCENE_MODEL_API_KEY=sk-1\n", updated);
    }

    @Test
    public void setValueRemovesTheKeyWhenTheFieldIsCleared() {
        String updated = ModelEnvFile.setValue("A=1\nMIDSCENE_MODEL_API_KEY=sk-1\nB=2\n",
                "MIDSCENE_MODEL_API_KEY", "");

        assertEquals("A=1\nB=2\n", updated);
    }

    @Test
    public void setValueCollapsesADuplicatedKeyIntoOneLine() {
        String updated = ModelEnvFile.setValue("A=1\nKEY=first\nB=2\nKEY=second\n",
                "KEY", "third");

        assertEquals("A=1\nB=2\nKEY=third\n", updated);
    }

    @Test
    public void valuesWithSpacesHashesOrQuotesSurviveARoundTrip() {
        for (String value : new String[]{"sk-1", "a b", "va#lue", "qu\"ote", "a=b", "back\\slash", "tab\there"}) {
            String text = ModelEnvFile.setValue("", "MIDSCENE_MODEL_API_KEY", value);
            assertEquals(value, ModelEnvFile.value(text, "MIDSCENE_MODEL_API_KEY"));
        }
    }

    @Test
    public void quotedValuesAreUnescapedLikeTheDesktopEditorDoes() {
        assertEquals("sk-plain", ModelEnvFile.value("KEY=\"sk-plain\"\n", "KEY"));
        assertEquals("say \"hi\"", ModelEnvFile.value("KEY=\"say \\\"hi\\\"\"\n", "KEY"));
        assertEquals("C:\\models", ModelEnvFile.value("KEY=\"C:\\\\models\"\n", "KEY"));
    }

    @Test
    public void missingKeysAcceptsCompatibleAliases() {
        assertTrue(ModelEnvFile.missingKeys("").contains("MIDSCENE_MODEL_API_KEY"));
        assertTrue(ModelEnvFile.missingKeys("MIDSCENE_MODEL_API_KEY=sk\n").contains("MIDSCENE_MODEL_BASE_URL"));
        assertTrue(ModelEnvFile.missingKeys("OPENAI_API_KEY=sk\nOPENAI_BASE_URL=https://x/v1\n")
                .contains("MIDSCENE_MODEL_NAME"));
        assertTrue(ModelEnvFile.missingKeys(
                        "OPENAI_API_KEY=sk\nOPENAI_BASE_URL=https://x/v1\nOPENAI_MODEL=gpt\n")
                .contains("MIDSCENE_MODEL_FAMILY"));
        assertTrue(ModelEnvFile.missingKeys(
                        "MIDSCENE_MODEL_API_KEY=sk\nMIDSCENE_MODEL_BASE_URL=https://x/v1\n"
                                + "MIDSCENE_MODEL_NAME=gpt\nMIDSCENE_MODEL_FAMILY=gemini\n")
                .isEmpty());
    }

    /**
     * The family is required, and it is the only key no alias can satisfy: the agent reads
     * this name alone, and without it every run warns that element localization is
     * unavailable.
     */
    @Test
    public void familyIsRequired() {
        String everythingElse = "MIDSCENE_MODEL_API_KEY=sk\nMIDSCENE_MODEL_BASE_URL=https://x/v1\n"
                + "MIDSCENE_MODEL_NAME=gpt\n";
        assertEquals(java.util.Collections.singletonList(ModelEnvFile.MODEL_FAMILY),
                ModelEnvFile.missingKeys(everythingElse));
    }

    @Test
    public void mergeFillsPastedKeysAndLeavesTheRestAlone() {
        String current = "# mine\nMIDSCENE_MODEL_NAME=old\nOTHER=1\n";

        String merged = ModelEnvFile.merge(current,
                "# pasted\nMIDSCENE_MODEL_NAME=qwen3-vl-plus\nMIDSCENE_MODEL_API_KEY=sk-2\n");

        assertEquals("# mine\nMIDSCENE_MODEL_NAME=qwen3-vl-plus\nOTHER=1\nMIDSCENE_MODEL_API_KEY=sk-2\n",
                merged);
    }

    @Test
    public void formFieldsKeepTheStudioOrderAndKinds() {
        assertEquals(4, ModelEnvFile.FIELDS.size());
        assertEquals(ModelEnvFile.BASE_URL, ModelEnvFile.FIELDS.get(0).key);
        assertEquals(ModelEnvFile.API_KEY, ModelEnvFile.FIELDS.get(1).key);
        assertEquals(ModelEnvFile.MODEL_NAME, ModelEnvFile.FIELDS.get(2).key);
        assertEquals(ModelEnvFile.MODEL_FAMILY, ModelEnvFile.FIELDS.get(3).key);
        assertEquals("The API key your model service issued",
                ModelEnvFile.FIELDS.get(1).placeholder);
        // Only the key is masked and keyboarded as a secret; the base URL gets a URL keyboard.
        assertEquals(ModelEnvFile.Field.Kind.SECRET, ModelEnvFile.FIELDS.get(1).kind);
        assertEquals(ModelEnvFile.Field.Kind.URL, ModelEnvFile.FIELDS.get(0).kind);
        assertEquals(ModelEnvFile.Field.Kind.TEXT, ModelEnvFile.FIELDS.get(2).kind);
        // The family is picked from a list rather than typed: the agent matches it verbatim.
        assertEquals(ModelEnvFile.Field.Kind.CHOICE, ModelEnvFile.FIELDS.get(3).kind);
        assertEquals(ModelEnvFile.FAMILY_VALUES, ModelEnvFile.FIELDS.get(3).choices);
        for (ModelEnvFile.Field field : ModelEnvFile.FIELDS.subList(0, 3)) {
            assertTrue("only a CHOICE row carries options", field.choices.isEmpty());
        }
    }

    /**
     * The hints describe what to fill in; no vendor is held up as the way to do it.
     *
     * A concrete endpoint or key sample in a hint reads as a requirement, and every
     * OpenAI-compatible service is equally valid — that is what this guards against
     * coming back. Family values are the one place an example belongs: the agent only
     * accepts the names it knows, so the hint shows a couple of them.
     */
    @Test
    public void noHintNamesAVendor() {
        for (ModelEnvFile.Field field : ModelEnvFile.FIELDS) {
            assertNoVendorSample(field.placeholder);
        }
        assertNoVendorSample(ModelEnvFile.TEMPLATE);
    }

    private static void assertNoVendorSample(String text) {
        String lower = text.toLowerCase(java.util.Locale.ROOT);
        for (String sample : new String[]{"dashscope", "aliyun", "https://", "sk-"}) {
            assertFalse(text + " names a vendor sample: " + sample, lower.contains(sample));
        }
    }

    @Test
    public void templateCarriesNoKeys() {
        assertTrue(ModelEnvFile.parse(ModelEnvFile.TEMPLATE).entries.isEmpty());
    }
}
