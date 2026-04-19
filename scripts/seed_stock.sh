#!/usr/bin/env bash
# ============================================================
# 测试数据脚本：全商品入库 300 箱 + 每业务员出库 100 箱
# 用法：bash scripts/seed_stock.sh
# 依赖：curl, jq
# ============================================================

BASE="http://localhost:8888"
COOKIE_FILE="/tmp/wh_seed_cookie.txt"
INBOUND_BOXES=300
TRANSFER_BOXES=100
TODAY=$(date +%Y-%m-%d)

# 颜色输出
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC}  $1"; exit 1; }

# ============================================================
# 1. 管理员登录，保存 Session Cookie
# ============================================================
log "管理员登录..."
LOGIN_RES=$(curl -s -c "$COOKIE_FILE" -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}')
echo "  登录响应: $LOGIN_RES"
CODE=$(echo "$LOGIN_RES" | jq -r '.code // .status // 0')
if [[ "$CODE" != "200" && "$CODE" != "0" ]]; then
  err "登录失败，请检查账号密码或后端是否运行"
fi
log "登录成功"

# ============================================================
# 2. 获取所有在用商品
# ============================================================
log "获取商品列表..."
PRODUCTS=$(curl -s -b "$COOKIE_FILE" "$BASE/api/product/list")
PRODUCT_COUNT=$(echo "$PRODUCTS" | jq '.data | length')
log "共 $PRODUCT_COUNT 个商品"
[[ "$PRODUCT_COUNT" -eq 0 ]] && err "商品列表为空，请先录入商品"

# ============================================================
# 3. 获取仓库列表
# ============================================================
log "获取仓库列表..."
WAREHOUSES=$(curl -s -b "$COOKIE_FILE" "$BASE/api/warehouse/list")

MAIN_ID="main"
VEH_BIG="veh_sp_big"
VEH_SMALL="veh_sp_small"
VEH_THIRD="veh_sp_third"

# ============================================================
# 4. 构建入库明细：每个商品 300 箱
# ============================================================
log "构建入库单明细（每商品 ${INBOUND_BOXES} 箱）..."

INBOUND_LINES="["
FIRST=1
while IFS= read -r product; do
  pid=$(echo "$product" | jq -r '.id')
  pname=$(echo "$product" | jq -r '.name')
  box_qty=$(echo "$product" | jq -r '.boxQty // 1')
  price=$(echo "$product" | jq -r '.purchasePrice // 0')

  # 袋数 = 箱数 × 每箱袋数
  qty=$((INBOUND_BOXES * box_qty))

  [[ $FIRST -eq 0 ]] && INBOUND_LINES+=","
  INBOUND_LINES+="{\"productId\":\"$pid\",\"qty\":$qty,\"boxQty\":$INBOUND_BOXES,\"price\":$price}"
  FIRST=0
  log "  - $pname: ${INBOUND_BOXES}箱 × ${box_qty}袋/箱 = ${qty}袋"
done < <(echo "$PRODUCTS" | jq -c '.data[]')

INBOUND_LINES+="]"

# ============================================================
# 5. 入库：保存草稿
# ============================================================
log "创建入库单（草稿）..."
SAVE_RES=$(curl -s -b "$COOKIE_FILE" -X POST "$BASE/api/inbound/save" \
  -H "Content-Type: application/json" \
  -d "{\"doc\":{\"supplierId\":\"test_seed\",\"date\":\"$TODAY\",\"status\":\"draft\",\"remark\":\"测试脚本入库 ${INBOUND_BOXES}箱\"},\"lines\":$INBOUND_LINES}")
echo "  保存响应: $(echo "$SAVE_RES" | jq -r '.msg // .message // "ok"')"
INBOUND_ID=$(echo "$SAVE_RES" | jq -r '.data.id // empty')
[[ -z "$INBOUND_ID" ]] && err "入库单保存失败: $SAVE_RES"
log "入库单 ID: $INBOUND_ID"

# 6. 过账入库单
log "过账入库单..."
POST_RES=$(curl -s -b "$COOKIE_FILE" -X POST "$BASE/api/inbound/post/$INBOUND_ID")
echo "  过账响应: $(echo "$POST_RES" | jq -r '.msg // .message // "ok"')"
POST_CODE=$(echo "$POST_RES" | jq -r '.code // 0')
[[ "$POST_CODE" != "200" && "$POST_CODE" != "0" ]] && err "入库过账失败: $POST_RES"
log "✓ 入库完成，主仓库存 +${INBOUND_BOXES}箱/商品"

# ============================================================
# 7. 出库（调拨）：主仓 → 各业务员车库，每人 100 箱
# ============================================================
declare -A VEHICLES
VEHICLES["大车"]="$VEH_BIG"
VEHICLES["小车"]="$VEH_SMALL"
VEHICLES["三车"]="$VEH_THIRD"

for SP_NAME in "大车" "小车" "三车"; do
  TO_WH="${VEHICLES[$SP_NAME]}"
  log "---------- 为 $SP_NAME 出库 ${TRANSFER_BOXES}箱 → $TO_WH ----------"

  TRANSFER_LINES="["
  FIRST=1
  while IFS= read -r product; do
    pid=$(echo "$product" | jq -r '.id')
    box_qty=$(echo "$product" | jq -r '.boxQty // 1')
    qty=$((TRANSFER_BOXES * box_qty))

    [[ $FIRST -eq 0 ]] && TRANSFER_LINES+=","
    TRANSFER_LINES+="{\"productId\":\"$pid\",\"qty\":$qty,\"boxQty\":$TRANSFER_BOXES}"
    FIRST=0
  done < <(echo "$PRODUCTS" | jq -c '.data[]')

  TRANSFER_LINES+="]"

  # 保存调拨单
  TR_SAVE=$(curl -s -b "$COOKIE_FILE" -X POST "$BASE/api/transfer/save" \
    -H "Content-Type: application/json" \
    -d "{\"doc\":{\"fromWarehouseId\":\"$MAIN_ID\",\"toWarehouseId\":\"$TO_WH\",\"date\":\"$TODAY\",\"status\":\"draft\",\"remark\":\"测试出库 $SP_NAME ${TRANSFER_BOXES}箱\"},\"lines\":$TRANSFER_LINES}")
  TR_ID=$(echo "$TR_SAVE" | jq -r '.data.id // empty')
  [[ -z "$TR_ID" ]] && { warn "$SP_NAME 调拨单保存失败: $TR_SAVE"; continue; }
  log "  调拨单 ID: $TR_ID"

  # 过账调拨单
  TR_POST=$(curl -s -b "$COOKIE_FILE" -X POST "$BASE/api/transfer/post/$TR_ID")
  TR_CODE=$(echo "$TR_POST" | jq -r '.code // 0')
  if [[ "$TR_CODE" != "200" && "$TR_CODE" != "0" ]]; then
    warn "$SP_NAME 调拨过账失败: $TR_POST"
  else
    log "✓ $SP_NAME 车库 +${TRANSFER_BOXES}箱/商品"
  fi
done

# ============================================================
# 8. 结果汇总
# ============================================================
echo ""
log "============================================================"
log "完成！库存分配如下："
log "  主仓：入库 ${INBOUND_BOXES}箱 - 出库 $((TRANSFER_BOXES * 3))箱 = $((INBOUND_BOXES - TRANSFER_BOXES * 3))箱 剩余"
log "  大车车库：+${TRANSFER_BOXES}箱/商品"
log "  小车车库：+${TRANSFER_BOXES}箱/商品"
log "  三车车库：+${TRANSFER_BOXES}箱/商品"
log "============================================================"

rm -f "$COOKIE_FILE"
