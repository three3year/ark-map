<script lang="ts">
  import type { FooterItem } from "./footer.ts";
  import { strings } from "./strings.ts";

  interface Props {
    items: FooterItem[];
  }
  let { items }: Props = $props();
</script>

<footer>
  <p>
    {#each items as item, i (item.label)}{#if i > 0}{strings.footerSeparator}{/if}<a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        title={item.hint}>{item.label}</a
      >{#if item.kind === "server"}{strings.footerDataVersion(
          item.version,
          item.checkedAtTaiwanTime,
        )}{/if}{/each}
  </p>
  <p>{strings.footerNotice}</p>
</footer>

<style>
  footer {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 0.82rem;
  }
  p {
    margin: 0;
  }
  p + p {
    margin-top: 4px;
  }
  a {
    color: var(--accent);
  }
</style>
