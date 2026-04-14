import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Maximize2, Move, RefreshCcw } from 'lucide-react';

/**
 * ドラッグおよびリサイズ可能なパネルコンポーネント
 * PCではフローティング表示、モバイルでは通常のスタック表示に切り替わります。
 */
const DraggablePanel = ({ 
  children, 
  title, 
  id, 
  isMobile, 
  initialPos = { x: 0, y: 0 }, 
  initialSize = { width: '100%', height: 'auto' },
  className = ""
}) => {
  const [isFloating, setIsFloating] = useState(!isMobile);
  const [pos, setPos] = useState(initialPos);
  const [size, setSize] = useState({ 
    width: typeof initialSize.width === 'number' ? initialSize.width : 500, 
    height: typeof initialSize.height === 'number' ? initialSize.height : 400 
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [hasResizedDown, setHasResizedDown] = useState(false);
  
  const panelRef = useRef(null);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const resizeStartSize = useRef({ w: 0, h: 0 });

  // 初回のサイズ取得（非フローティング時のみ）
  useEffect(() => {
    if (panelRef.current && !isFloating) {
      const rect = panelRef.current.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    }
  }, [isMobile, isFloating]);

  // モバイル切り替え時にフローティング状態を同期
  useEffect(() => {
    setIsFloating(!isMobile);
  }, [isMobile]);

  // ドラッグ開始
  const handleDragStart = (e) => {
    if (isMobile) return;
    
    // ドラッグ開始時にグリッドからフローティングに切り替え
    if (!isFloating && panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      // スクロール位置を考慮して絶対座標を計算
      setPos({ x: rect.left, y: rect.top + window.scrollY });
      setSize({ width: rect.width, height: rect.height });
      setIsFloating(true);
    }

    setIsDragging(true);
    dragStartPos.current = { 
      x: e.clientX - pos.x, 
      y: e.clientY - pos.y 
    };
    e.preventDefault();
  };

  // リサイズ開始
  const handleResizeStart = (e) => {
    if (isMobile) return;
    
    if (!isFloating && panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      setPos({ x: rect.left, y: rect.top + window.scrollY });
      setSize({ width: rect.width, height: rect.height });
      setIsFloating(true);
    }

    setIsResizing(true);
    setHasResizedDown(true);
    
    // 現在のサイズが 'auto' などの場合は実数に正規化
    let currentWidth = size.width;
    let currentHeight = size.height;
    if (panelRef.current) {
      const rect = panelRef.current.getBoundingClientRect();
      currentWidth = rect.width;
      currentHeight = rect.height;
      setSize({ width: currentWidth, height: currentHeight });
    }

    dragStartPos.current = { x: e.clientX, y: e.clientY };
    resizeStartSize.current = { w: currentWidth, h: currentHeight };
    e.preventDefault();
    e.stopPropagation();
  };

  // マウス移動（ドラッグ・リサイズ共通）
  const handleMouseMove = useCallback((e) => {
    if (isDragging) {
      setPos({
        x: e.clientX - dragStartPos.current.x,
        y: e.clientY - dragStartPos.current.y
      });
    } else if (isResizing) {
      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;
      setSize({
        width: Math.max(200, resizeStartSize.current.w + deltaX),
        height: Math.max(150, resizeStartSize.current.h + deltaY)
      });
    }
  }, [isDragging, isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

  // 配置のリセット
  const resetLayout = () => {
    setPos(initialPos);
    setSize({
      width: typeof initialSize.width === 'number' ? initialSize.width : 500,
      height: typeof initialSize.height === 'number' ? initialSize.height : 'auto'
    });
    setHasResizedDown(false);
    setIsDragging(false);
    setIsResizing(false);
  };

  const style = !isMobile && isFloating ? {
    position: 'absolute',
    left: `${pos.x}px`,
    top: `${pos.y}px`,
    width: `${size.width}px`,
    height: hasResizedDown ? `${size.height}px` : initialSize.height,
    zIndex: isDragging || isResizing ? 100 : 50,
    margin: 0,
    transition: isDragging || isResizing ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
  } : {};

  return (
    <div 
      ref={panelRef}
      id={id}
      className={`panel ${className} ${isFloating ? 'floating' : ''} ${isDragging ? 'dragging' : ''} ${hasResizedDown || typeof initialSize.height === 'number' ? 'resized' : ''}`}
      style={style}
    >
      <div className="panel-header" onMouseDown={handleDragStart}>
        <div className="panel-title-area">
          <Move size={14} className="drag-icon" />
          <h2>{title}</h2>
        </div>
        {!isMobile && isFloating && (
          <button className="reset-pos-btn" onClick={resetLayout} title="配置を初期状態に戻す">
            <RefreshCcw size={14} />
          </button>
        )}
      </div>
      
      <div className="panel-content">
        {children}
      </div>

      {!isMobile && (
        <div className="resize-handle" onMouseDown={handleResizeStart}>
          <Maximize2 size={16} />
        </div>
      )}
    </div>
  );
};

export default DraggablePanel;
