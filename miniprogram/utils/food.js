function publicComments(shop) {
  return (shop.comments || []).filter((comment) => comment.isPublicComment !== false)
}

function averageScore(shop) {
  const comments = publicComments(shop)
  if (!comments.length) return 0
  const total = comments.reduce((sum, comment) => sum + Number(comment.score || 0), 0)
  return Math.round((total / comments.length) * 10) / 10
}

function itemComments(shop, itemId) {
  return publicComments(shop).filter((comment) => comment.itemId === itemId)
}

function itemCommentCount(shop, itemId) {
  return itemComments(shop, itemId).length
}

function itemAverageScore(shop, itemId) {
  const comments = itemComments(shop, itemId)
  if (!comments.length) return 0
  const total = comments.reduce((sum, comment) => sum + Number(comment.score || 0), 0)
  return Math.round((total / comments.length) * 10) / 10
}

function buildDerivedData(shops) {
  return (shops || []).map((shop) => ({
    ...shop,
    score: averageScore(shop),
    commentCount: publicComments(shop).length,
    items: (shop.items || []).map((item) => ({
      ...item,
      score: itemAverageScore(shop, item.id),
      commentCount: itemCommentCount(shop, item.id)
    }))
  }))
}

function allItemsWithShop(shops, areas) {
  return (shops || []).flatMap((shop) => {
    const area = (areas || []).find((item) => item.id === shop.areaId)
    return (shop.items || []).map((item) => ({
      item,
      shop,
      area,
      score: itemAverageScore(shop, item.id),
      commentCount: itemCommentCount(shop, item.id)
    }))
  })
}

function shopScoreRank(shops, areas, limit = 10) {
  return (shops || [])
    .filter((shop) => !shop.isClosed && publicComments(shop).length > 0)
    .map((shop) => ({
      shop,
      area: (areas || []).find((area) => area.id === shop.areaId),
      score: averageScore(shop),
      commentCount: publicComments(shop).length
    }))
    .sort((a, b) => b.score - a.score || b.commentCount - a.commentCount)
    .slice(0, limit)
}

function shopHeatRank(shops, areas, limit = 10) {
  return (shops || [])
    .filter((shop) => !shop.isClosed && publicComments(shop).length > 0)
    .map((shop) => ({
      shop,
      area: (areas || []).find((area) => area.id === shop.areaId),
      score: averageScore(shop),
      commentCount: publicComments(shop).length
    }))
    .sort((a, b) => b.commentCount - a.commentCount || b.score - a.score)
    .slice(0, limit)
}

function itemScoreRank(shops, areas, limit = 10) {
  return allItemsWithShop(shops, areas)
    .filter((entry) => entry.commentCount > 0 && !entry.shop.isClosed && !entry.item.isOffShelf)
    .sort((a, b) => b.score - a.score || b.commentCount - a.commentCount)
    .slice(0, limit)
}

function itemHeatRank(shops, areas, limit = 10) {
  return allItemsWithShop(shops, areas)
    .filter((entry) => entry.commentCount > 0 && !entry.shop.isClosed && !entry.item.isOffShelf)
    .sort((a, b) => b.commentCount - a.commentCount || b.score - a.score)
    .slice(0, limit)
}

function searchAll(keyword, shops, areas) {
  const query = String(keyword || '').trim().toLowerCase()
  if (!query) return { shops: [], items: [] }
  const matchedShops = (shops || []).filter((shop) => {
    const area = (areas || []).find((item) => item.id === shop.areaId)
    return [shop.name, shop.description, (shop.tags || []).join(' '), area && area.name, area && area.campus, area && area.kind]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })
  const matchedItems = allItemsWithShop(shops, areas).filter((entry) => {
    return [entry.item.name, entry.item.price, entry.item.description, entry.shop.name, entry.area && entry.area.name, entry.area && entry.area.campus]
      .join(' ')
      .toLowerCase()
      .includes(query)
  })
  return { shops: matchedShops, items: matchedItems }
}

function formatScore(value) {
  return Number(value || 0) > 0 ? Number(value).toFixed(1) : '暂无'
}

module.exports = {
  publicComments,
  averageScore,
  itemCommentCount,
  itemAverageScore,
  buildDerivedData,
  allItemsWithShop,
  shopScoreRank,
  shopHeatRank,
  itemScoreRank,
  itemHeatRank,
  searchAll,
  formatScore
}
