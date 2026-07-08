import { describe, it, expect } from 'vitest';
import { parseTrendingHtml } from '../src/lib/scraper';

const SAMPLE_HTML = `
<article class="Box-row">
  <div class="float-right d-flex">
    <div data-view-component="true" class="BtnGroup d-flex">
      <a href="/login" class="btn-sm btn">Star</a>
    </div>
  </div>
  <h2 class="h3 lh-condensed">
    <a href="/FujiwaraChoki/MoneyPrinterV2" data-view-component="true" class="Link">
      <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-repo mr-1 color-fg-muted"></svg>
      <span class="text-normal">FujiwaraChoki /</span>
      MoneyPrinterV2
    </a>
  </h2>
  <p class="col-9 color-fg-muted my-1 pr-4">
    Automate the process of making money online.
  </p>
  <div class="f6 color-fg-muted mt-2">
    <span class="d-inline-block ml-0 mr-3">
      <span class="repo-language-color" style="background-color: #3572A5"></span>
      <span itemprop="programmingLanguage">Python</span>
    </span>
    <a class="Link Link--muted d-inline-block mr-3" href="/FujiwaraChoki/MoneyPrinterV2/stargazers">
      <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" class="octicon octicon-star"></svg>
      26,690
    </a>
    <a class="Link Link--muted d-inline-block mr-3" href="/FujiwaraChoki/MoneyPrinterV2/forks">
      <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" class="octicon octicon-repo-forked"></svg>
      2,791
    </a>
    <span class="d-inline-block float-sm-right">
      10,158 stars today
    </span>
  </div>
</article>
<article class="Box-row">
  <div class="float-right d-flex">
    <div data-view-component="true" class="BtnGroup d-flex">
      <a href="/login" class="btn-sm btn">Star</a>
    </div>
  </div>
  <h2 class="h3 lh-condensed">
    <a href="/Crosstalk-Solutions/project-nomad" data-view-component="true" class="Link">
      <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" data-view-component="true" class="octicon octicon-repo mr-1 color-fg-muted"></svg>
      <span class="text-normal">Crosstalk-Solutions /</span>
      project-nomad
    </a>
  </h2>
  <p class="col-9 color-fg-muted my-1 pr-4">
    A self-contained offline survival computer.
  </p>
  <div class="f6 color-fg-muted mt-2">
    <span class="d-inline-block ml-0 mr-3">
      <span class="repo-language-color" style="background-color: #2b7489"></span>
      <span itemprop="programmingLanguage">TypeScript</span>
    </span>
    <a class="Link Link--muted d-inline-block mr-3" href="/Crosstalk-Solutions/project-nomad/stargazers">
      <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" class="octicon octicon-star"></svg>
      18,227
    </a>
    <a class="Link Link--muted d-inline-block mr-3" href="/Crosstalk-Solutions/project-nomad/forks">
      <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" class="octicon octicon-repo-forked"></svg>
      1,745
    </a>
    <span class="d-inline-block float-sm-right">
      14,531 stars this week
    </span>
  </div>
</article>
`;

describe('parseTrendingHtml', () => {
  it('parses repo owner and name from href', () => {
    const repos = parseTrendingHtml(SAMPLE_HTML, 'daily');
    expect(repos[0].owner).toBe('FujiwaraChoki');
    expect(repos[0].name).toBe('MoneyPrinterV2');
    expect(repos[0].fullName).toBe('FujiwaraChoki/MoneyPrinterV2');
  });

  it('parses description', () => {
    const repos = parseTrendingHtml(SAMPLE_HTML, 'daily');
    expect(repos[0].description).toBe('Automate the process of making money online.');
  });

  it('parses programming language', () => {
    const repos = parseTrendingHtml(SAMPLE_HTML, 'daily');
    expect(repos[0].language).toBe('Python');
    expect(repos[1].language).toBe('TypeScript');
  });

  it('parses star and fork counts', () => {
    const repos = parseTrendingHtml(SAMPLE_HTML, 'daily');
    expect(repos[0].stars).toBe(26690);
    expect(repos[0].forks).toBe(2791);
  });

  it('parses period stars and label', () => {
    const repos = parseTrendingHtml(SAMPLE_HTML, 'daily');
    expect(repos[0].periodStars).toBe(10158);
    expect(repos[0].periodLabel).toBe('today');
    expect(repos[1].periodStars).toBe(14531);
    expect(repos[1].periodLabel).toBe('this week');
  });

  it('builds correct GitHub URL', () => {
    const repos = parseTrendingHtml(SAMPLE_HTML, 'daily');
    expect(repos[0].url).toBe('https://github.com/FujiwaraChoki/MoneyPrinterV2');
  });

  it('parses multiple repos', () => {
    const repos = parseTrendingHtml(SAMPLE_HTML, 'daily');
    expect(repos).toHaveLength(2);
    expect(repos[1].fullName).toBe('Crosstalk-Solutions/project-nomad');
  });

  it('returns empty array for empty HTML', () => {
    const repos = parseTrendingHtml('', 'daily');
    expect(repos).toEqual([]);
  });

  it('handles repo with no description', () => {
    const htmlNoDesc = `
    <article class="Box-row">
      <h2 class="h3 lh-condensed">
        <a href="/owner/repo" class="Link">
          <span class="text-normal">owner /</span> repo
        </a>
      </h2>
      <div class="f6 color-fg-muted mt-2">
        <span class="d-inline-block ml-0 mr-3">
          <span itemprop="programmingLanguage">Go</span>
        </span>
        <a class="Link Link--muted d-inline-block mr-3" href="/owner/repo/stargazers">
          <svg></svg> 100
        </a>
        <a class="Link Link--muted d-inline-block mr-3" href="/owner/repo/forks">
          <svg></svg> 10
        </a>
        <span class="d-inline-block float-sm-right">50 stars today</span>
      </div>
    </article>`;
    const repos = parseTrendingHtml(htmlNoDesc, 'daily');
    expect(repos[0].description).toBe('');
    expect(repos[0].language).toBe('Go');
  });
});
