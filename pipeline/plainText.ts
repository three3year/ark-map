/** The game's rich-text markup, `<@ba.kw>…</>`; plain `<荒季>` brackets are text and stay. */
const richTextTag = /<[@$][^>]*>|<\/>/g;

export const plainText = (text: string): string => text.replace(richTextTag, "");
