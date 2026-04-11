import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

/**
 * Tooltip Component
 * デスクトップではホバー、モバイルではタップで表示されるツールチップ。
 * Portalsを使用して、Mobileのスクロールや親要素の重なり順（z-index）の影響を受けないように実装。
 */
const Tooltip = ({ content, children, showIcon = false }) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef(null);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // ツールチップの位置計算
  const updatePosition = () => {
    if (triggerRef.current && tooltipRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      
      // ビューポート基準で計算（Portalを使用するためfixed想定）
      let top = triggerRect.top - tooltipRect.height - 8;
      let left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);

      // 画面端の判定（はみ出し防止）
      if (left < 10) left = 10;
      if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
      }
      
      // 上にスペースがない場合は下に表示
      if (top < 10) {
        top = triggerRect.bottom + 8;
      }

      setPosition({ top, left });
    }
  };

  useEffect(() => {
    if (isVisible) {
      updatePosition();
      const handleEvents = () => updatePosition();
      
      // 引数に true (capture) を渡すことで、サイドバーなどの子要素のスクロールもキャッチする
      window.addEventListener('scroll', handleEvents, true);
      window.addEventListener('resize', handleEvents);
      return () => {
        window.removeEventListener('scroll', handleEvents, true);
        window.removeEventListener('resize', handleEvents);
      };
    }
  }, [isVisible]);

  // モバイル向け：外側タップで閉じる処理
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Portalを使用しているため、triggerRef.current と tooltipRef.current の両方をチェック
      if (triggerRef.current && !triggerRef.current.contains(event.target) &&
          tooltipRef.current && !tooltipRef.current.contains(event.target)) {
        setIsVisible(false);
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isVisible]);

  // ホバーイベントハンドラ（遅延処理付き）
  const handlePointerEnter = (e) => {
    if (e.pointerType === 'touch') return; // タッチデバイスではクリックのみに任せる
    
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 700);
  };

  const handlePointerLeave = (e) => {
    if (e.pointerType === 'touch') return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const toggleTooltip = (e) => {
    e.stopPropagation();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(!isVisible);
  };

  // ツールチップの内容
  const tooltipPopup = isVisible && content && (
    <div 
      ref={tooltipRef}
      className="tooltip-popup"
      style={{ 
        position: 'fixed',
        top: position.top,
        left: position.left,
        zIndex: 2000 // サイドバーなどよりも確実に上に表示
      }}
    >
      {content}
      <div className="tooltip-arrow" />
    </div>
  );

  return (
    <div className="tooltip-wrapper">
      <div 
        ref={triggerRef}
        className="tooltip-trigger"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onClick={toggleTooltip}
      >
        <div className="tooltip-content-grow">
          {children}
        </div>
        {showIcon && <HelpCircle size={14} className="tooltip-icon" />}
      </div>

      {createPortal(tooltipPopup, document.body)}
    </div>
  );
};

export default Tooltip;
