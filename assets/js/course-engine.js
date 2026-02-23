/* ============================================================
   COURSE ENGINE — Reveal.js + GSAP + Lottie + D3 Integration
   Shared initialization & animation helpers for all modules
   ============================================================ */

(function () {
  'use strict';

  /* ---------- Constants ---------- */
  const ANIM_DEFAULTS = {
    duration: 0.8,
    ease: 'expo.out',
    stagger: 0.12,
  };

  /* ---------- Reveal.js Initialization ---------- */
  window.initCoursePresentation = function (options = {}) {
    const defaults = {
      hash: true,
      history: true,
      slideNumber: 'c/t',
      showSlideNumber: 'all',
      transition: 'fade',
      transitionSpeed: 'default',
      backgroundTransition: 'fade',
      center: false,
      width: 1280,
      height: 720,
      margin: 0.04,
      minScale: 0.2,
      maxScale: 2.0,
      autoAnimateEasing: 'ease-out',
      autoAnimateDuration: 0.8,
      pdfSeparateFragments: false,
      viewDistance: 3,
      display: 'flex',
      plugins: [RevealMarkdown, RevealHighlight, RevealNotes],
    };

    const config = Object.assign({}, defaults, options);

    Reveal.initialize(config).then(() => {
      console.log('[CourseEngine] Reveal.js initialized');
      setupGSAPIntegration();
      setupLottieSlideControl();
      setupLabPanelAnimations();
      setupPillarAnimations();
      setupParallaxBackgrounds();
      // Fire initial slide animations
      animateCurrentSlide();
    });
  };

  /* ---------- GSAP ↔ Reveal.js Bridge ---------- */
  function setupGSAPIntegration() {
    if (typeof gsap === 'undefined') {
      console.warn('[CourseEngine] GSAP not loaded — skipping animation setup');
      return;
    }

    // Register GSAP plugins if available
    if (typeof ScrollTrigger !== 'undefined') gsap.registerPlugin(ScrollTrigger);

    // Animate on slide change
    Reveal.on('slidechanged', (event) => {
      animateSlide(event.currentSlide);
    });

    // Animate on fragment shown
    Reveal.on('fragmentshown', (event) => {
      animateFragment(event.fragment);
    });

    // Kill animations on slide leave
    Reveal.on('slidetransitionend', () => {
      // Clean up any lingering animations from previous slides
    });
  }

  function animateCurrentSlide() {
    const currentSlide = Reveal.getCurrentSlide();
    if (currentSlide) animateSlide(currentSlide);
  }

  /* ---------- Slide Entry Animations ---------- */
  function animateSlide(slide) {
    if (!slide || typeof gsap === 'undefined') return;

    // Animate headings
    const headings = slide.querySelectorAll('h1, h2, h3');
    if (headings.length) {
      gsap.fromTo(headings,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out', stagger: 0.1 }
      );
    }

    // Animate paragraphs and lists
    const textElements = slide.querySelectorAll('p, li, .glass-panel, .clinical-note');
    if (textElements.length) {
      gsap.fromTo(textElements,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.06, delay: 0.2 }
      );
    }

    // Animate KPI cards with stagger
    const kpiCards = slide.querySelectorAll('.kpi-card');
    if (kpiCards.length) {
      gsap.fromTo(kpiCards,
        { opacity: 0, y: 40, scale: 0.9 },
        {
          opacity: 1, y: 0, scale: 1,
          duration: ANIM_DEFAULTS.duration,
          ease: 'back.out(1.4)',
          stagger: ANIM_DEFAULTS.stagger,
          delay: 0.3,
        }
      );
    }

    // Animate timeline items
    const timelineItems = slide.querySelectorAll('.timeline__item');
    if (timelineItems.length) {
      gsap.fromTo(timelineItems,
        { opacity: 0, x: -30 },
        { opacity: 1, x: 0, duration: 0.6, ease: 'expo.out', stagger: 0.15, delay: 0.2 }
      );
    }

    // Animate table rows
    const tableRows = slide.querySelectorAll('.comparison-table tbody tr');
    if (tableRows.length) {
      gsap.fromTo(tableRows,
        { opacity: 0, x: -20 },
        { opacity: 1, x: 0, duration: 0.4, ease: 'power2.out', stagger: 0.08, delay: 0.3 }
      );
    }

    // Animate badges
    const badges = slide.querySelectorAll('.badge');
    if (badges.length) {
      gsap.fromTo(badges,
        { opacity: 0, scale: 0.7 },
        { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)', stagger: 0.08, delay: 0.4 }
      );
    }

    // Custom data-gsap attribute support
    const customElements = slide.querySelectorAll('[data-gsap]');
    customElements.forEach((el) => {
      try {
        const animConfig = JSON.parse(el.getAttribute('data-gsap'));
        gsap.fromTo(el,
          animConfig.from || { opacity: 0 },
          Object.assign({ opacity: 1, duration: 0.6, ease: 'expo.out' }, animConfig.to || {})
        );
      } catch (e) {
        console.warn('[CourseEngine] Invalid data-gsap JSON:', e);
      }
    });
  }

  /* ---------- Fragment Animations ---------- */
  function animateFragment(fragment) {
    if (!fragment || typeof gsap === 'undefined') return;

    if (fragment.classList.contains('animate-count')) {
      animateCountUp(fragment);
    }

    if (fragment.classList.contains('animate-bar')) {
      animateBar(fragment);
    }

    if (fragment.classList.contains('animate-draw')) {
      animateDrawSVG(fragment);
    }
  }

  /* ---------- Count-Up Animation for Numbers ---------- */
  function animateCountUp(element) {
    const target = parseFloat(element.getAttribute('data-target') || element.textContent);
    const decimals = parseInt(element.getAttribute('data-decimals') || '0', 10);
    const suffix = element.getAttribute('data-suffix') || '';
    const obj = { val: 0 };

    gsap.to(obj, {
      val: target,
      duration: 1.5,
      ease: 'expo.out',
      onUpdate: () => {
        element.textContent = obj.val.toFixed(decimals) + suffix;
      },
    });
  }

  /* ---------- Bar / Range Fill Animation ---------- */
  function animateBar(element) {
    const targetWidth = element.getAttribute('data-width') || '75%';
    gsap.fromTo(element,
      { width: '0%' },
      { width: targetWidth, duration: 1.2, ease: 'expo.out' }
    );
  }

  /* ---------- SVG Draw Animation ---------- */
  function animateDrawSVG(element) {
    const paths = element.querySelectorAll('path, line, circle, polyline');
    paths.forEach((path) => {
      const length = path.getTotalLength ? path.getTotalLength() : 0;
      if (length) {
        gsap.fromTo(path,
          { strokeDasharray: length, strokeDashoffset: length },
          { strokeDashoffset: 0, duration: 2, ease: 'power2.inOut' }
        );
      }
    });
  }

  /* ---------- Lab Panel Animations ---------- */
  function setupLabPanelAnimations() {
    // Auto-animate range bars when they appear
    Reveal.on('slidechanged', (event) => {
      const bars = event.currentSlide.querySelectorAll('.range-bar__fill');
      bars.forEach((bar) => {
        const width = bar.getAttribute('data-width') || bar.style.width;
        if (typeof gsap !== 'undefined') {
          gsap.fromTo(bar,
            { width: '0%' },
            { width: width, duration: 1.2, ease: 'expo.out', delay: 0.5 }
          );
        }
      });
    });
  }

  /* ---------- 6-Pillar Framework Animation ---------- */
  function setupPillarAnimations() {
    Reveal.on('slidechanged', (event) => {
      const pillars = event.currentSlide.querySelectorAll('.pillar');
      if (!pillars.length || typeof gsap === 'undefined') return;

      const tl = gsap.timeline({ delay: 0.3 });

      // Foundation rises first
      const foundation = event.currentSlide.querySelector('.pillar__foundation');
      if (foundation) {
        tl.fromTo(foundation,
          { opacity: 0, scaleY: 0 },
          { opacity: 1, scaleY: 1, duration: 0.5, ease: 'power2.out', transformOrigin: 'bottom' }
        );
      }

      // Columns rise sequentially
      pillars.forEach((pillar, i) => {
        const column = pillar.querySelector('.pillar__column');
        const icon = pillar.querySelector('.pillar__icon');
        const label = pillar.querySelector('.pillar__label');

        if (column) {
          tl.fromTo(column,
            { scaleY: 0, opacity: 0 },
            { scaleY: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.2)', transformOrigin: 'bottom' },
            i * 0.15
          );
        }
        if (icon) {
          tl.fromTo(icon,
            { opacity: 0, scale: 0 },
            { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)' },
            (i * 0.15) + 0.3
          );
        }
        if (label) {
          tl.fromTo(label,
            { opacity: 0, y: 10 },
            { opacity: 1, y: 0, duration: 0.3 },
            (i * 0.15) + 0.5
          );
        }
      });
    });
  }

  /* ---------- Parallax Background Elements ---------- */
  function setupParallaxBackgrounds() {
    Reveal.on('slidechanged', (event) => {
      const bgElements = event.currentSlide.querySelectorAll('.parallax-element');
      if (!bgElements.length || typeof gsap === 'undefined') return;

      bgElements.forEach((el) => {
        gsap.fromTo(el,
          { x: -20, opacity: 0 },
          { x: 0, opacity: 0.15, duration: 1.5, ease: 'power1.out' }
        );
      });
    });
  }

  /* ---------- Lottie Slide Lifecycle ---------- */
  function setupLottieSlideControl() {
    Reveal.on('slidechanged', (event) => {
      // Pause Lottie on previous slide
      if (event.previousSlide) {
        const prevPlayers = event.previousSlide.querySelectorAll('lottie-player');
        prevPlayers.forEach((p) => { try { p.pause(); } catch(e) {} });
      }
      // Play Lottie on current slide
      const currentPlayers = event.currentSlide.querySelectorAll('lottie-player');
      currentPlayers.forEach((p) => { try { p.play(); } catch(e) {} });
    });
  }

  /* ---------- D3.js Chart Helpers ---------- */
  window.CourseCharts = {
    /**
     * Create an animated donut chart for hormone panel distributions.
     * @param {string} selector - CSS selector for container
     * @param {Array} data - [{label, value, color}]
     * @param {Object} opts - {width, height, innerRadius, outerRadius}
     */
    donut: function (selector, data, opts = {}) {
      if (typeof d3 === 'undefined') {
        console.warn('[CourseCharts] D3 not loaded');
        return;
      }

      const width = opts.width || 300;
      const height = opts.height || 300;
      const innerRadius = opts.innerRadius || 60;
      const outerRadius = opts.outerRadius || Math.min(width, height) / 2 - 20;

      const container = d3.select(selector);
      container.selectAll('*').remove();

      const svg = container.append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .append('g')
        .attr('transform', `translate(${width / 2},${height / 2})`);

      const pie = d3.pie().value(d => d.value).sort(null);
      const arc = d3.arc().innerRadius(innerRadius).outerRadius(outerRadius);

      const arcs = svg.selectAll('.arc')
        .data(pie(data))
        .enter()
        .append('g')
        .attr('class', 'arc');

      arcs.append('path')
        .attr('fill', d => d.data.color)
        .attr('stroke', '#120e10')
        .attr('stroke-width', 2)
        .transition()
        .duration(1000)
        .attrTween('d', function (d) {
          const interp = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
          return function (t) { return arc(interp(t)); };
        });

      // Labels
      arcs.append('text')
        .attr('transform', d => `translate(${arc.centroid(d)})`)
        .attr('text-anchor', 'middle')
        .attr('fill', 'rgba(255, 250, 245, 0.95)')
        .attr('font-size', '12px')
        .attr('font-family', 'Inter, sans-serif')
        .attr('opacity', 0)
        .text(d => d.data.label)
        .transition()
        .delay(800)
        .duration(400)
        .attr('opacity', 1);
    },

    /**
     * Create an animated bar chart for lab values.
     * @param {string} selector - CSS selector for container
     * @param {Array} data - [{label, value, max, color, unit}]
     * @param {Object} opts - {width, height, barHeight}
     */
    horizontalBars: function (selector, data, opts = {}) {
      if (typeof d3 === 'undefined') return;

      const width = opts.width || 500;
      const height = opts.height || data.length * 60 + 40;
      const barHeight = opts.barHeight || 28;
      const margin = { top: 10, right: 40, bottom: 10, left: 120 };

      const container = d3.select(selector);
      container.selectAll('*').remove();

      const svg = container.append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`);

      const maxVal = d3.max(data, d => d.max || d.value * 1.3);
      const x = d3.scaleLinear()
        .domain([0, maxVal])
        .range([margin.left, width - margin.right]);

      const y = d3.scaleBand()
        .domain(data.map(d => d.label))
        .range([margin.top, height - margin.bottom])
        .padding(0.35);

      // Background bars
      svg.selectAll('.bar-bg')
        .data(data)
        .enter()
        .append('rect')
        .attr('x', margin.left)
        .attr('y', d => y(d.label))
        .attr('width', width - margin.left - margin.right)
        .attr('height', y.bandwidth())
        .attr('rx', 4)
        .attr('fill', 'rgba(212, 175, 165, 0.06)');

      // Value bars — animated
      svg.selectAll('.bar-value')
        .data(data)
        .enter()
        .append('rect')
        .attr('x', margin.left)
        .attr('y', d => y(d.label))
        .attr('width', 0)
        .attr('height', y.bandwidth())
        .attr('rx', 4)
        .attr('fill', d => d.color || '#c97a8a')
        .transition()
        .duration(1000)
        .delay((d, i) => i * 120)
        .ease(d3.easeCubicOut)
        .attr('width', d => x(d.value) - margin.left);

      // Labels
      svg.selectAll('.bar-label')
        .data(data)
        .enter()
        .append('text')
        .attr('x', margin.left - 8)
        .attr('y', d => y(d.label) + y.bandwidth() / 2)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'middle')
        .attr('fill', 'rgba(212, 175, 165, 0.7)')
        .attr('font-size', '13px')
        .attr('font-family', 'Inter, sans-serif')
        .text(d => d.label);

      // Value labels
      svg.selectAll('.bar-val-label')
        .data(data)
        .enter()
        .append('text')
        .attr('x', d => x(d.value) + 6)
        .attr('y', d => y(d.label) + y.bandwidth() / 2)
        .attr('dominant-baseline', 'middle')
        .attr('fill', 'rgba(255, 250, 245, 0.95)')
        .attr('font-size', '13px')
        .attr('font-weight', '600')
        .attr('font-family', 'Inter, sans-serif')
        .attr('opacity', 0)
        .text(d => `${d.value}${d.unit || ''}`)
        .transition()
        .delay((d, i) => 600 + i * 120)
        .duration(400)
        .attr('opacity', 1);
    },

    /**
     * Create a sparkline for trend data.
     * @param {string} selector
     * @param {Array} values - number[]
     * @param {Object} opts - {width, height, color, strokeWidth}
     */
    sparkline: function (selector, values, opts = {}) {
      if (typeof d3 === 'undefined') return;

      const width = opts.width || 120;
      const height = opts.height || 40;
      const color = opts.color || '#c97a8a';
      const strokeWidth = opts.strokeWidth || 2;

      const container = d3.select(selector);
      container.selectAll('*').remove();

      const svg = container.append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`);

      const x = d3.scaleLinear().domain([0, values.length - 1]).range([4, width - 4]);
      const y = d3.scaleLinear().domain(d3.extent(values)).range([height - 4, 4]);

      const line = d3.line()
        .x((d, i) => x(i))
        .y(d => y(d))
        .curve(d3.curveMonotoneX);

      const path = svg.append('path')
        .datum(values)
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', strokeWidth)
        .attr('stroke-linecap', 'round')
        .attr('d', line);

      // Animate draw
      const totalLength = path.node().getTotalLength();
      path
        .attr('stroke-dasharray', totalLength)
        .attr('stroke-dashoffset', totalLength)
        .transition()
        .duration(1200)
        .ease(d3.easeCubicOut)
        .attr('stroke-dashoffset', 0);

      // End dot
      svg.append('circle')
        .attr('cx', x(values.length - 1))
        .attr('cy', y(values[values.length - 1]))
        .attr('r', 3)
        .attr('fill', color)
        .attr('opacity', 0)
        .transition()
        .delay(1000)
        .duration(300)
        .attr('opacity', 1);
    },
  };

  /* ---------- Utility: Typewriter Effect ---------- */
  window.typewriterEffect = function (element, text, speed = 30) {
    element.textContent = '';
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
      } else {
        clearInterval(interval);
      }
    }, speed);
  };

})();
