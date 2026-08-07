import { ArenaBounds, BodySegment, FoodState, SnakeState } from '../types';
import { SENTENCE_GOLD_PALETTE } from './foodGenerator';

export function renderGame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bounds: ArenaBounds,
  snakes: Record<string, SnakeState>,
  foods: Record<string, FoodState>,
  mySnakeId: string | null,
  cameraZoom: number,
  clickEffectPoint: { x: number; y: number; time: number } | null
) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // Background pattern
  ctx.fillStyle = '#0f172a'; // slate-900
  ctx.fillRect(0, 0, width, height);

  const mySnake = mySnakeId ? snakes[mySnakeId] : null;
  const cameraX = mySnake ? mySnake.head.x : (bounds.minX + bounds.maxX) / 2;
  const cameraY = mySnake ? mySnake.head.y : (bounds.minY + bounds.maxY) / 2;

  ctx.translate(width / 2, height / 2);
  ctx.scale(cameraZoom, cameraZoom);
  ctx.translate(-cameraX, -cameraY);

  // 1. Draw Arena Boundary Grid & Shrinking Boundary
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 2;
  const gridSize = 60;
  for (let x = Math.floor(bounds.minX / gridSize) * gridSize; x <= bounds.maxX; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, bounds.minY);
    ctx.lineTo(x, bounds.maxY);
    ctx.stroke();
  }
  for (let y = Math.floor(bounds.minY / gridSize) * gridSize; y <= bounds.maxY; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(bounds.minX, y);
    ctx.lineTo(bounds.maxX, y);
    ctx.stroke();
  }

  // Boundary wall
  ctx.strokeStyle = '#f43f5e'; // Red boundary wall
  ctx.lineWidth = 6;
  ctx.strokeRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

  // 2. Draw Ground Foods (NO GOLD!)
  for (const fId of Object.keys(foods)) {
    const food = foods[fId];
    if (food.state !== 'ground') continue;

    ctx.save();
    ctx.beginPath();
    ctx.arc(food.x, food.y, food.collisionRadius, 0, Math.PI * 2);
    ctx.fillStyle = food.color;
    ctx.shadowColor = food.color;
    ctx.shadowBlur = 10;
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px "Inter", "Noto Sans JP", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(food.displayedGlyph, food.x, food.y);
    ctx.restore();
  }

  // 3. Draw Snakes
  for (const sId of Object.keys(snakes)) {
    const snake = snakes[sId];
    if (!snake.connected || snake.bodyPath.length === 0) continue;

    // Draw Body Segments along path
    const path = snake.bodyPath;
    let pathIdx = 0;

    // Group segments
    let segIdx = 0;
    for (let i = path.length - 1; i >= 0; i--) {
      const pt = path[i];
      const isHead = (i === 0);

      // Determine segment color
      let segColor = snake.baseColor;
      let isGold = false;

      if (snake.bodySegments.length > 0) {
        const seg = snake.bodySegments[Math.min(segIdx, snake.bodySegments.length - 1)];
        if (seg.colorMode === 'gold') {
          segColor = SENTENCE_GOLD_PALETTE.primary;
          isGold = true;
        } else if (seg.colorMode === 'food') {
          segColor = seg.color;
        }
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isHead ? 20 : 16, 0, Math.PI * 2);
      ctx.fillStyle = segColor;

      if (isGold) {
        ctx.shadowColor = SENTENCE_GOLD_PALETTE.glow;
        ctx.shadowBlur = 18;
      }
      ctx.fill();

      ctx.strokeStyle = isGold ? '#ffffff' : 'rgba(0,0,0,0.3)';
      ctx.lineWidth = isGold ? 3 : 2;
      ctx.stroke();
      ctx.restore();

      if (i % 4 === 0 && segIdx < snake.bodySegments.length - 1) {
        segIdx++;
      }
    }

    // Draw Tail Target Emblem (Easy to see and click)
    const tailPoint = path[path.length - 1];
    if (tailPoint) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(tailPoint.x, tailPoint.y, 22, 0, Math.PI * 2);
      ctx.fillStyle = snake.heldFoods.length > 0 ? '#ef4444' : '#64748b';
      ctx.globalAlpha = 0.85;
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Tail Target Icon / Text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(snake.heldFoods.length > 0 ? 'TAIL' : 'TAIL', tailPoint.x, tailPoint.y);
      ctx.restore();
    }

    // Draw Samurai Back Flags
    let flagNodeIndex = 6;
    for (const seg of snake.bodySegments) {
      if (!seg.flag || flagNodeIndex >= path.length) break;

      const flagPt = path[flagNodeIndex];
      const isSentenceFlag = seg.flag.type === 'sentence';

      ctx.save();
      ctx.translate(flagPt.x, flagPt.y);

      // Flag pole
      const poleHeight = isSentenceFlag ? 55 : 38;
      const flagWidth = isSentenceFlag ? 110 : 70;
      const flagHeight = isSentenceFlag ? 28 : 20;

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -poleHeight);
      ctx.strokeStyle = isSentenceFlag ? '#fbbf24' : '#e2e8f0';
      ctx.lineWidth = isSentenceFlag ? 4 : 3;
      ctx.stroke();

      // Flag Banner
      ctx.beginPath();
      ctx.rect(0, -poleHeight, flagWidth, flagHeight);
      ctx.fillStyle = isSentenceFlag ? SENTENCE_GOLD_PALETTE.primary : '#1e293b';
      ctx.shadowColor = isSentenceFlag ? SENTENCE_GOLD_PALETTE.glow : 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = isSentenceFlag ? 15 : 6;
      ctx.fill();

      ctx.strokeStyle = isSentenceFlag ? '#ffffff' : '#94a3b8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Flag Text
      ctx.fillStyle = isSentenceFlag ? '#000000' : '#ffffff';
      ctx.font = `bold ${isSentenceFlag ? 13 : 11}px "Noto Sans JP", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(seg.flag.text, 6, -poleHeight + flagHeight / 2);
      ctx.restore();

      flagNodeIndex += 6;
    }

    // Draw Snake Head (Samurai Helmet & Eyes)
    const head = snake.head;
    ctx.save();
    ctx.translate(head.x, head.y);
    const angle = Math.atan2(snake.direction.y, snake.direction.x);
    ctx.rotate(angle);

    // Head Base
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fillStyle = snake.baseColor;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Samurai Helmet (Kabutowari Crescent)
    ctx.beginPath();
    ctx.arc(4, 0, 16, -Math.PI / 3, Math.PI / 3);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(10, -7, 5, 0, Math.PI * 2);
    ctx.arc(10, 7, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(12, -7, 2.5, 0, Math.PI * 2);
    ctx.arc(12, 7, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Draw Mouth Held Foods Chain (1st at mouth, 2nd+ folds back opposite to movement direction with swaying animation)
    if (snake.heldFoods.length > 0) {
      const time = Date.now() / 150;
      const dirX = snake.direction.x || 1;
      const dirY = snake.direction.y || 0;
      const perpX = -dirY;
      const perpY = dirX;

      // Draw connecting chain line
      ctx.save();
      ctx.beginPath();
      snake.heldFoods.forEach((_, idx) => {
        let px: number, py: number;
        if (idx === 0) {
          px = head.x + dirX * 26;
          py = head.y + dirY * 26;
        } else {
          const wobble = Math.sin(time * 3.5 + idx * 0.9) * (5 + idx * 1.5);
          px = head.x + dirX * 26 - dirX * (idx * 24) + perpX * wobble;
          py = head.y + dirY * 26 - dirY * (idx * 24) + perpY * wobble;
        }
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.restore();

      // Draw each held food node
      snake.heldFoods.forEach((item, idx) => {
        let posX: number, posY: number;

        if (idx === 0) {
          // 1st food: right at mouth
          posX = head.x + dirX * 26;
          posY = head.y + dirY * 26;
        } else {
          // 2nd food and onwards: folds back in opposite direction of movement with swaying wobble
          const wobble = Math.sin(time * 3.5 + idx * 0.9) * (5 + idx * 1.5);
          posX = head.x + dirX * 26 - dirX * (idx * 24) + perpX * wobble;
          posY = head.y + dirY * 26 - dirY * (idx * 24) + perpY * wobble;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(posX, posY, 13, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.shadowColor = item.color;
        ctx.shadowBlur = 8;
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px "Noto Sans JP", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.glyph, posX, posY);
        ctx.restore();
      });
    }

    // Draw Nickname above head
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(`${snake.nickname} (${snake.totalLength})`, head.x, head.y - 32);
    ctx.restore();
  }

  // 4. Click ripple effect
  if (clickEffectPoint) {
    const elapsed = Date.now() - clickEffectPoint.time;
    if (elapsed < 600) {
      const radius = (elapsed / 600) * 35;
      const alpha = 1.0 - (elapsed / 600);
      ctx.save();
      ctx.beginPath();
      ctx.arc(clickEffectPoint.x, clickEffectPoint.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
}
