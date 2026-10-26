<div align="center" style="margin: 20px 0;">
  <a href="[https://example.com](https://trail-blazer2.github.io/watercolor_modal/
)" class="modern-gradient-btn">
    <span>Go there</span>
    <svg class="btn-arrow" viewBox="0 0 24 24" xmlns="http://w3.org">
      <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </a>
</div>

<style>
  .modern-gradient-btn {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 16px;
    font-weight: 600;
    color: #ffffff !important;
    background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
    padding: 14px 32px;
    border-radius: 50px;
    text-decoration: none !important;
    box-shadow: 0 4px 15px rgba(99, 102, 241, 0.35);
    transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
    cursor: pointer;
  }

  .modern-gradient-btn .btn-arrow {
    width: 18px;
    height: 18px;
    transition: transform 0.3s ease;
  }

  .modern-gradient-btn:hover {
    background: linear-gradient(135deg, #4f46e5 0%, #9333ea 100%);
    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.5);
    transform: translateY(-2px);
  }

  .modern-gradient-btn:hover .btn-arrow {
    transform: translateX(5px);
  }

  .modern-gradient-btn:active {
    transform: translateY(1px);
    box-shadow: 0 3px 10px rgba(99, 102, 241, 0.4);
  }
</style>
