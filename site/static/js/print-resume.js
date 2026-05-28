/*
 * Print Resume
 *
 * Injects a floating "Print Resume" button on the homepage. When clicked,
 * it scrapes the rendered page (About / Experience / Contact widgets) and
 * opens a new window with a paper-style resume that follows the layout of
 * Resume_Richard_Sheng_(盛开南).docx, ready to print or save as PDF.
 */
(function () {
  'use strict';

  function isZh() {
    var lang = (document.documentElement.getAttribute('lang') || 'en').toLowerCase();
    if (lang.indexOf('zh') === 0) return true;
    return /\/zh(\/|$)/.test(window.location.pathname);
  }

  var T = {
    en: {
      btn: 'Print Resume',
      title: 'Resume',
      personalInfo: 'Personal Information',
      name: 'Name',
      role: 'Role',
      location: 'Location',
      email: 'Email',
      website: 'Website',
      links: 'Links',
      summary: 'Self Comments',
      education: 'Education Background',
      language: 'Language Ability',
      languages: 'English (Working Proficiency), Mandarin Chinese (Native), Cantonese (Conversational)',
      experience: 'Working Experience',
      print: 'Print / Save as PDF',
      close: 'Close',
      tip: 'Tip: in the print dialog, choose "Save as PDF" to export.'
    },
    zh: {
      btn: '打印简历',
      title: '简历',
      personalInfo: '个人信息',
      name: '姓名',
      role: '职位',
      location: '所在地',
      email: '邮箱',
      website: '个人网站',
      links: '链接',
      summary: '自我评价',
      education: '教育背景',
      language: '语言能力',
      languages: '英语（工作熟练），普通话（母语），粤语（日常交流）',
      experience: '工作经历',
      print: '打印 / 保存为 PDF',
      close: '关闭',
      tip: '提示：在打印对话框中选择"另存为 PDF"即可导出。'
    }
  };

  function tr() {
    return isZh() ? T.zh : T.en;
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function textOrEmpty(el) {
    return el ? (el.textContent || '').trim() : '';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function extractEmail() {
    var mail = $('.social-icon a[href^="mailto:"]');
    if (!mail) return '';
    return (mail.getAttribute('href') || '').replace(/^mailto:/, '');
  }

  function extractPortrait() {
    var el = $('#profile .portrait');
    if (!el) return '';
    // The avatar is applied as an inline background-image. Pull the URL out.
    var bg = (el.style && el.style.backgroundImage) || '';
    var m = bg.match(/url\((['"]?)([^'")]+)\1\)/);
    if (m && m[2]) return m[2];
    // Fallback: try the computed style.
    try {
      var cs = window.getComputedStyle(el).backgroundImage || '';
      var m2 = cs.match(/url\((['"]?)([^'")]+)\1\)/);
      if (m2 && m2[2]) return m2[2];
    } catch (e) { /* ignore */ }
    return '';
  }

  function extractSocialLinks() {
    return $$('.social-icon a').map(function (a) {
      var href = a.getAttribute('href') || '';
      if (/^mailto:/.test(href)) return null;
      return href;
    }).filter(Boolean);
  }

  function extractWebsiteUrl() {
    // Prefer the explicit public URL meta tag (so localhost previews still
    // print the real deployed address). Fall back to <link rel=canonical>,
    // then the current location.
    var meta = document.querySelector('meta[name="resume-public-url"]');
    var url = meta ? (meta.getAttribute('content') || '') : '';
    if (!url) {
      var c = document.querySelector('link[rel="canonical"]');
      url = c ? (c.getAttribute('href') || '') : '';
    }
    if (!url) url = window.location.origin + window.location.pathname;
    return url.replace(/index\.html?$/, '');
  }

  function extractSummary() {
    // The about widget renders the markdown content into the right column.
    var aboutSection = $('#about');
    if (!aboutSection) return '';
    var contentCol = aboutSection.querySelector('[itemprop="description"]');
    if (!contentCol) return '';
    // The first h1 in the content is the section title (e.g. "Summary" / "概要");
    // everything that follows up to the next .row (interests/education) is the summary body.
    var nodes = Array.prototype.slice.call(contentCol.childNodes);
    var paragraphs = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.nodeType !== 1) continue;
      var tag = n.tagName.toLowerCase();
      if (tag === 'h1' || tag === 'h2') continue; // skip section title
      if (n.classList && n.classList.contains('row')) break; // interests/education block
      if (tag === 'p') {
        var t = (n.textContent || '').trim();
        if (t) paragraphs.push(t);
      }
    }
    return paragraphs.join('\n');
  }

  function extractInterests() {
    return $$('#about .ul-interests li').map(function (li) {
      return (li.textContent || '').trim();
    }).filter(Boolean);
  }

  function extractEducation() {
    return $$('#about .ul-edu > li').map(function (li) {
      return {
        course: textOrEmpty(li.querySelector('.course')),
        institution: textOrEmpty(li.querySelector('.institution'))
      };
    });
  }

  function extractExperience() {
    // The "custom" widget wraps markdown content in:
    //   <section id="experience">
    //     <div class="container"><div class="row">
    //       <div class="...section-heading"><h1>title</h1></div>
    //       <div class="col-md-8">  <-- the h3 / p / ul we want live here
    //         ### date range
    //         paragraph(s) describing company/role
    //         bullet list of responsibilities
    //
    // We look for the content column (the .col-* that is NOT .section-heading),
    // and fall back to scanning all descendants of #experience if needed.
    var section = $('#experience');
    if (!section) return [];

    var contentRoot = null;
    var cols = $$('#experience [class*="col-"]');
    for (var i = 0; i < cols.length; i++) {
      if (!cols[i].classList.contains('section-heading')) {
        contentRoot = cols[i];
        break;
      }
    }
    if (!contentRoot) contentRoot = section;

    var entries = [];
    var current = null;
    var nodes = Array.prototype.slice.call(contentRoot.children);
    nodes.forEach(function (node) {
      var tag = node.tagName ? node.tagName.toLowerCase() : '';
      if (tag === 'h1' || tag === 'h2') {
        return; // page-level section title — skip
      }
      if (tag === 'h3') {
        if (current) entries.push(current);
        current = {
          date: (node.textContent || '').trim(),
          headingHtml: '',
          bullets: []
        };
        return;
      }
      if (!current) return;
      if (tag === 'p') {
        var html = node.innerHTML.trim();
        if (html) {
          current.headingHtml += (current.headingHtml ? '<br>' : '') + html;
        }
        return;
      }
      if (tag === 'ul') {
        $$('li', node).forEach(function (li) {
          current.bullets.push(li.innerHTML.trim());
        });
      }
    });
    if (current) entries.push(current);
    return entries;
  }

  function nameRoleLocation() {
    var name = textOrEmpty($('#profile .portrait-title h2[itemprop="name"]'))
      || textOrEmpty($('#profile .portrait-title h2'))
      || textOrEmpty($('meta[name="author"]'))
      || textOrEmpty($('#profile [itemprop="worksFor"]'));
    if (!name) {
      var authorMeta = document.querySelector('meta[name="author"]');
      if (authorMeta) name = (authorMeta.getAttribute('content') || '').trim();
    }
    var role = textOrEmpty($('#profile .portrait-title h3[itemprop="jobTitle"]'));
    // Address isn't always rendered as a labelled field; try to recover it
    // from the contact widget by looking for a Shanghai/China-ish line.
    var address = '';
    $$('#contact li, #contact p').forEach(function (el) {
      var txt = (el.textContent || '').trim();
      if (!address && /shanghai|上海|china|中国/i.test(txt)) {
        address = txt;
      }
    });
    return { name: name, role: role, address: address };
  }

  function buildResumeHtml() {
    var t = tr();
    var profile = nameRoleLocation();
    var portrait = extractPortrait();
    var email = extractEmail();
    var website = extractWebsiteUrl();
    var links = extractSocialLinks();
    var summary = extractSummary();
    var interests = extractInterests();
    var education = extractEducation();
    var experience = extractExperience();

    var lang = isZh() ? 'zh' : 'en';

    // Name and role are already shown in the header next to the portrait,
    // so we keep the Personal Information table focused on contact details.
    var personalRows = [];
    if (profile.address) {
      personalRows.push({ k: t.location, v: profile.address });
    }
    if (email) {
      personalRows.push({ k: t.email, v: email });
    }
    if (website) {
      personalRows.push({
        k: t.website,
        v: '<a href="' + escapeHtml(website) + '">'
          + escapeHtml(website.replace(/^https?:\/\//, '').replace(/\/$/, ''))
          + '</a>'
      });
    }
    if (links.length) {
      personalRows.push({
        k: t.links,
        v: links.map(function (h) {
          return '<a href="' + escapeHtml(h) + '">' + escapeHtml(h.replace(/^https?:\/\//, '')) + '</a>';
        }).join('  ·  ')
      });
    }

    var personalRowsHtml = personalRows.map(function (r) {
      return ''
        + '<tr>'
        + '<th>' + escapeHtml(r.k) + '</th>'
        + '<td>' + r.v + '</td>'
        + '</tr>';
    }).join('');

    var educationHtml = education.map(function (e) {
      var parts = [];
      if (e.institution) parts.push('<strong>' + escapeHtml(e.institution) + '</strong>');
      if (e.course) parts.push(escapeHtml(e.course));
      return '<li>' + parts.join(' &mdash; ') + '</li>';
    }).join('');

    var interestsHtml = interests.length
      ? '<div class="extras"><h2>' + escapeHtml(isZh() ? '专业特长' : 'Specialty') + '</h2><ul class="inline">'
        + interests.map(function (i) { return '<li>' + escapeHtml(i) + '</li>'; }).join('')
        + '</ul></div>'
      : '';

    var experienceHtml = experience.map(function (e) {
      var bullets = e.bullets.length
        ? '<ul>' + e.bullets.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>'
        : '';
      return ''
        + '<div class="job">'
        + '<div class="job-date">' + escapeHtml(e.date) + '</div>'
        + '<div class="job-body">'
        + (e.headingHtml ? '<div class="job-heading">' + e.headingHtml + '</div>' : '')
        + bullets
        + '</div>'
        + '</div>';
    }).join('');

    return ''
      + '<!doctype html>'
      + '<html lang="' + lang + '">'
      + '<head>'
      + '<meta charset="utf-8">'
      + '<title>' + escapeHtml(t.title + ' - ' + (profile.name || '')) + '</title>'
      + '<style>' + buildResumeCss() + '</style>'
      + '</head>'
      + '<body>'
      + '<div class="toolbar no-print">'
      + '<button onclick="window.print()">' + escapeHtml(t.print) + '</button>'
      + '<button onclick="window.close()">' + escapeHtml(t.close) + '</button>'
      + '<span class="tip">' + escapeHtml(t.tip) + '</span>'
      + '</div>'
      + '<main class="page">'
      + '<div class="resume-title">' + escapeHtml(t.title) + '</div>'
      + '<header class="resume-header">'
      + (portrait
        ? '<img class="portrait-img" src="' + escapeHtml(portrait) + '" alt="' + escapeHtml(profile.name || 'portrait') + '">'
        : '')
      + '<div class="identity">'
      + (profile.name ? '<h1 class="full-name">' + escapeHtml(profile.name) + '</h1>' : '')
      + (profile.role ? '<div class="role">' + escapeHtml(profile.role) + '</div>' : '')
      + '</div>'
      + '</header>'
      + (personalRows.length
        ? '<section><h2>' + escapeHtml(t.personalInfo) + '</h2>'
          + '<table class="personal">' + personalRowsHtml + '</table>'
          + '</section>'
        : '')
      + (summary
        ? '<section><h2>' + escapeHtml(t.summary) + '</h2><div class="summary">'
          + summary.split('\n').map(function (line) {
            return '<p>' + escapeHtml(line) + '</p>';
          }).join('')
          + '</div></section>'
        : '')
      + (educationHtml
        ? '<section><h2>' + escapeHtml(t.education) + '</h2><ul class="edu">' + educationHtml + '</ul></section>'
        : '')
      + '<section><h2>' + escapeHtml(t.language) + '</h2><p>' + escapeHtml(t.languages) + '</p></section>'
      + (experienceHtml
        ? '<section><h2>' + escapeHtml(t.experience) + '</h2>' + experienceHtml + '</section>'
        : '')
      + interestsHtml
      + '</main>'
      + '</body>'
      + '</html>';
  }

  function buildResumeCss() {
    return [
      '@page { size: A4; margin: 18mm 16mm; }',
      'html, body { background: #f2f2f2; }',
      'body { font-family: "Helvetica Neue", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", Arial, sans-serif; color: #222; margin: 0; padding: 24px 0 48px; line-height: 1.55; font-size: 12pt; }',
      '.toolbar { position: sticky; top: 0; z-index: 10; background: #1f2933; color: #fff; padding: 10px 16px; display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.15); }',
      '.toolbar button { background: #4f9eff; color: #fff; border: 0; padding: 8px 14px; border-radius: 4px; cursor: pointer; font-size: 14px; }',
      '.toolbar button + button { background: #6b7280; }',
      '.toolbar button:hover { filter: brightness(1.1); }',
      '.toolbar .tip { font-size: 12px; opacity: 0.85; margin-left: auto; }',
      '.page { background: #fff; max-width: 210mm; margin: 24px auto; padding: 22mm 18mm; box-shadow: 0 4px 16px rgba(0,0,0,0.12); box-sizing: border-box; min-height: 297mm; }',
      '.resume-title { text-align: center; font-size: 14pt; letter-spacing: 6px; color: #6b7280; text-transform: uppercase; margin: 0 0 6px; }',
      '.resume-header { display: flex; align-items: center; gap: 22px; padding-bottom: 14px; margin-bottom: 8px; border-bottom: 2px solid #222; }',
      '.resume-header .identity { flex: 1; }',
      '.resume-header .full-name { font-size: 26pt; margin: 0 0 4px; letter-spacing: 1px; color: #1f2933; }',
      '.resume-header .role { font-size: 13pt; color: #4b5563; }',
      '.portrait-img { width: 28mm; height: 36mm; object-fit: cover; border: 1px solid #d4d4d4; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.08); flex: 0 0 auto; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      'section { margin: 14px 0; page-break-inside: avoid; }',
      'section h2 { font-size: 13pt; margin: 18px 0 8px; padding: 4px 8px; background: #eef2f7; border-left: 4px solid #1f2933; }',
      'table.personal { width: 100%; border-collapse: collapse; }',
      'table.personal th { text-align: left; width: 110px; font-weight: 600; color: #555; padding: 4px 8px; vertical-align: top; }',
      'table.personal td { padding: 4px 8px; vertical-align: top; }',
      'table.personal a { color: #1d4ed8; text-decoration: none; }',
      '.summary p { margin: 4px 0; }',
      'ul.edu { padding-left: 18px; margin: 6px 0; }',
      'ul.edu li { margin: 2px 0; }',
      'ul.inline { list-style: none; padding: 0; margin: 4px 0; }',
      'ul.inline li { display: inline-block; background: #eef2f7; padding: 3px 10px; border-radius: 12px; margin: 2px 6px 2px 0; font-size: 11pt; }',
      '.job { display: flex; gap: 16px; margin: 10px 0 14px; page-break-inside: avoid; }',
      '.job-date { flex: 0 0 150px; font-weight: 600; color: #1f2933; }',
      '.job-body { flex: 1; }',
      '.job-heading { margin-bottom: 4px; }',
      '.job-heading a { color: #1d4ed8; text-decoration: none; }',
      '.job-body ul { padding-left: 18px; margin: 6px 0; }',
      '.job-body li { margin: 3px 0; }',
      '.job-body em { color: #6b7280; }',
      'a { color: inherit; }',
      '@media print {',
      '  html, body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      '  .no-print, .toolbar { display: none !important; }',
      '  .page { box-shadow: none; margin: 0; padding: 0; max-width: none; min-height: 0; }',
      '  h1.resume-title { margin-top: 0; }',
      '  .portrait-img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
      '  .job { break-inside: avoid; }',
      '  section { break-inside: avoid; }',
      '}'
    ].join('\n');
  }

  function openPrintWindow() {
    var html = buildResumeHtml();
    var w = window.open('', '_blank');
    if (!w) {
      alert(isZh()
        ? '无法打开新窗口，请允许浏览器弹出窗口后重试。'
        : 'Unable to open a new window. Please allow popups and try again.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  }

  function injectButton() {
    if (document.getElementById('print-resume-fab')) return;
    var t = tr();
    var btn = document.createElement('button');
    btn.id = 'print-resume-fab';
    btn.type = 'button';
    btn.setAttribute('aria-label', t.btn);
    btn.innerHTML = '<i class="fa fa-print" aria-hidden="true"></i><span>' + t.btn + '</span>';
    btn.addEventListener('click', openPrintWindow);
    document.body.appendChild(btn);

    var style = document.createElement('style');
    style.textContent = [
      '#print-resume-fab {',
      '  position: fixed; right: 24px; bottom: 24px; z-index: 1050;',
      '  background: #1f2933; color: #fff; border: 0;',
      '  padding: 12px 18px; border-radius: 28px;',
      '  box-shadow: 0 6px 16px rgba(0,0,0,0.2);',
      '  font-size: 14px; cursor: pointer;',
      '  display: inline-flex; align-items: center; gap: 8px;',
      '  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;',
      '}',
      '#print-resume-fab:hover { background: #2b3a4d; transform: translateY(-1px); box-shadow: 0 8px 20px rgba(0,0,0,0.25); }',
      '#print-resume-fab i { font-size: 16px; }',
      '@media print { #print-resume-fab { display: none !important; } }',
      '@media (max-width: 480px) {',
      '  #print-resume-fab { right: 16px; bottom: 16px; padding: 10px 14px; }',
      '  #print-resume-fab span { display: none; }',
      '}'
    ].join('\n');
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }
})();
