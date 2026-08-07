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
  clickEffectPoint: { x: number; y: number; time: number } | null,
  cameraOverride?: { x: number; y: number }
) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // Background pattern
  ctx.fillStyle = '#0f172a'; // slate-900
  ctx.fillRect(0, 0, width, height);

  const mySnake = mySnakeId ? snakes[mySnakeId] : null;
  const cameraX = cameraOverride ? cameraOverride.x : (mySnake ? mySnake.head.x : (bounds.minX + bounds.maxX) / 2);
  const cameraY = cameraOverride ? cameraOverride.y : (mySnake ? mySnake.head.y : (bounds.minY + bounds.maxY) / 2);

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

  // 2. Draw Ground Foods
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

    const path = snake.bodyPath;
    let segIdx = 0;

    // Draw Body Segments along path
    for (let i = path.length - 1; i >= 0; i--) {
      const pt = path[i];
      const isTail = (i === path.length - 1);
      const isHead = (i === 0);

      // Determine segment color
      let segColor = snake.baseColor;
      let isGold = false;

      if (isTail) {
        segColor = '#facc15'; // Bright Gold/Yellow Tail Segment
        isGold = true;
      } else if (snake.bodySegments.length > 0) {
        const seg = snake.bodySegments[Math.min(segIdx, snake.bodySegments.length - 1)];
        if (seg && seg.colorMode === 'gold') {
          segColor = SENTENCE_GOLD_PALETTE.primary;
          isGold = true;
        } else if (seg && seg.colorMode === 'food') {
          segColor = seg.color;
        }
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isHead ? 22 : isTail ? 17 : 15, 0, Math.PI * 2);
      ctx.fillStyle = segColor;

      if (isGold || isTail) {
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = isTail ? 22 : 18;
      }
      ctx.fill();

      ctx.strokeStyle = isTail ? '#ffffff' : isGold ? '#ffffff' : 'rgba(0,0,0,0.3)';
      ctx.lineWidth = isTail ? 3 : isGold ? 3 : 2;
      ctx.stroke();

      // Sparkling core on tail tip
      if (isTail) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 12;
        ctx.fill();
      }
      ctx.restore();

      if (i % 3 === 0 && segIdx < snake.bodySegments.length - 1) {
        segIdx++;
      }
    }

    // Draw Samurai Back Flags (Sashimono 指物) for completed Words & Sentences
    let flagNodeIndex = 6;
    for (const seg of snake.bodySegments) {
      if (!seg.flag) {
        flagNodeIndex += 3;
        continue; // Skip base segments without flags, do NOT break!
      }

      if (flagNodeIndex >= path.length) break;

      const flagPt = path[flagNodeIndex];
      const isSentenceFlag = seg.flag.type === 'sentence';

      ctx.save();
      ctx.translate(flagPt.x, flagPt.y);

      // Dynamic text measurement
      const text = seg.flag.text;
      ctx.font = `bold ${isSentenceFlag ? 13 : 11}px "Noto Sans JP", sans-serif`;
      const textWidth = ctx.measureText(text).width;

      const poleHeight = isSentenceFlag ? 58 : 42;
      const flagWidth = Math.max(isSentenceFlag ? 110 : 70, textWidth + 18);
      const flagHeight = isSentenceFlag ? 28 : 22;

      // Flag pole
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -poleHeight);
      ctx.strokeStyle = isSentenceFlag ? '#fbbf24' : '#38bdf8';
      ctx.lineWidth = isSentenceFlag ? 4 : 3;
      ctx.stroke();

      // Flag Top Crest (Golden Orb)
      ctx.beginPath();
      ctx.arc(0, -poleHeight, isSentenceFlag ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isSentenceFlag ? '#facc15' : '#38bdf8';
      ctx.fill();

      // Flag Banner Body (Traditional Sashimono)
      ctx.beginPath();
      ctx.rect(0, -poleHeight + 4, flagWidth, flagHeight);
      ctx.fillStyle = isSentenceFlag ? SENTENCE_GOLD_PALETTE.primary : '#0f172a';
      ctx.shadowColor = isSentenceFlag ? SENTENCE_GOLD_PALETTE.glow : 'rgba(56, 189, 248, 0.6)';
      ctx.shadowBlur = isSentenceFlag ? 18 : 8;
      ctx.fill();

      ctx.strokeStyle = isSentenceFlag ? '#ffffff' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Flag Text
      ctx.fillStyle = isSentenceFlag ? '#000000' : '#ffffff';
      ctx.font = `bold ${isSentenceFlag ? 13 : 11}px "Noto Sans JP", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 7, -poleHeight + 4 + flagHeight / 2);
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

    // Draw Mouth Held Foods Chain
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
          posX = head.x + dirX * 26;
          posY = head.y + dirY * 26;
        } else {
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

    // Draw Nickname above head (displays earned length!)
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 6;
    ctx.fillText(`${snake.nickname} (+${snake.earnedLength})`, head.x, head.y - 32);
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
