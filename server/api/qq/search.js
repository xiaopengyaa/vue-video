const cheerio = require('cheerio')
const qs = require('qs')
const { api, getResult, getSiteByUrl } = require('../../utils')
const { COOKIE, REFERER } = require('./constant')

const homeApi = {
  // 搜索
  async search(keyword) {
    const url = `https://v.qq.com/x/search/`
    const html = await api.get(url, { q: keyword })
    const $ = cheerio.load(html)
    const list = getSearchList($)
    const relateList = getRelateList($)

    return getResult({
      list,
      relateList,
    })
  },
  async getRecommendList(keyword) {
    const url = `https://nodeyun.video.qq.com/x/api/smartbox`
    const now = +new Date()
    const callback = `jQuery19105739095169365356_${now}`
    const html = await api.get(
      url,
      {
        query: keyword,
        callback,
        _: now,
      },
      {
        headers: {
          cookie: COOKIE,
          referer: REFERER,
        },
      }
    )
    const reg = new RegExp(`${callback}\\((.*)\\)`)
    const match = html.match(reg)
    let list = []
    if (match) {
      const res = JSON.parse(match[1])
      if (res.ret === 0 && res.data?.smartboxItemList) {
        list = res.data.smartboxItemList.map((item) => {
          return {
            title: item.basicDoc.title.replace(/em/g, 'strong'),
            imgUrl: item.videoInfo.imgUrl,
            videoType: item.videoInfo.videoType,
            typeName: item.videoInfo.typeName,
          }
        })
      }
    }
    return getResult(list)
  },
}

function getRelateList($) {
  let list = []
  let match = $('.result_series_new')
    .attr('r-props')
    ?.match(/totalData:\s*'(.*)'/)
  let data
  if (match) {
    data = JSON.parse(decodeURIComponent(match[1]))
    list = data.itemList.slice(0, 20).map((item) => {
      const video = item.videoInfo
      const playlist = []
      const obj = processUrl(video.url)
      let series = '0'

      if (video.firstBlockSites[0]?.episodeInfoList) {
        video.firstBlockSites[0]?.episodeInfoList.forEach((cItem, cIndex) => {
          const text = cItem.title
          const cObj = processUrl(cItem.url)
          let mark = ''

          if (cIndex === 0 && isNaN(Number(text))) {
            series = '1'
          }

          if (cItem.markLabel) {
            const label = JSON.parse(cItem.markLabel)
            if (label.tag_2?.param) {
              const cMatch = label.tag_2.param.match(/1X=(.*);/)
              if (cMatch) {
                mark = cMatch[1]
              }
            }
          }

          playlist.push({
            cid: obj.cid,
            vid: cObj.vid,
            href: cObj.href,
            text,
            mark,
          })
        })
      }
      return {
        site: getSiteByUrl(obj.href),
        cid: obj.cid,
        image: video.imgUrl,
        imageInfo: video.imgTag?.tag_3?.text || '',
        mark: video.imgTag?.tag_2?.param['1X'] || '',
        title: video.title
          .replaceAll('\u0005', '<span class="main">')
          .replaceAll('\u0006', '</span>'),
        href: obj.href,
        sub: [],
        desc: '',
        series,
        playlist,
        btnlist: [],
      }
    })
  }

  return list
}

function getSearchList($) {
  const list = []
  $('.search_container .mix_warp .result_item_v').each((index, elem) => {
    const cid = $(elem).attr('data-id')
    const image = $(elem).find('._infos .figure_pic').attr('src')
    const imageInfo = $(elem).find('._infos .figure_info').text() || ''
    const mark = $(elem).find('._infos .mark_v img').attr('src')
    const href = $(elem).find('._infos .result_title a').attr('href')
    const sub = $(elem).find('._infos .result_title .sub').text()
    const type = $(elem).find('._infos .result_title .type').text()
    const params = $(elem).find('.result_title').attr('dt-params')
    const title = qs
      .parse(params)
      .title_txt.replaceAll('\x05', '<span class="main">')
      .replaceAll('\x06', '</span>')
    const site = qs.parse(params).site_id

    const $desc = $(elem).find('._infos .desc_text')
    let desc = ''

    if ($desc.length) {
      desc = $desc.prop('firstChild').nodeValue
    }

    const obj = processUrl(href)
    const { series, playlist } = getPlaylist($, elem, cid)
    const btnlist = getBtnlist($, elem, cid)

    list.push({
      site,
      cid,
      image,
      imageInfo,
      mark,
      title,
      href: obj.href,
      sub: [type].concat(sub.replace(/\(|\)/g, '').split('/')),
      desc,
      series,
      playlist,
      btnlist,
    })
  })
  return list
}

function getPlaylist($, elem, cid) {
  let series = '0'
  const playlist = []
  let $item = $(elem).find('._playlist .result_episode_list .item')

  if (!$item.length) {
    series = '1'
    $item = $(elem).find('._playlist .tmpinnerList ._series_list .item')
  }

  $item.each((cIndex, cElem) => {
    if (cElem.attribs.class && cElem.attribs.class.includes('unfold')) {
      return
    }
    const text = $(cElem).find('a').text()
    const mark = $(cElem).find('.mark_v img').attr('src') || ''
    let href = $(cElem).find('a').attr('href')

    // 处理href
    if (href.includes('javascript')) {
      href = ''
    }
    const obj = processUrl(href)

    playlist.push({
      cid,
      vid: obj.vid,
      href: obj.href,
      text,
      mark,
    })
  })

  return {
    series,
    playlist,
  }
}

function getBtnlist($, elem, cid) {
  const btnlist = []

  $(elem)
    .find('._playlist .result_btn_line .btn_primary')
    .each((cIndex, cElem) => {
      const text = $(cElem).find('.icon_text').text()
      const href = $(cElem).attr('href')
      const obj = processUrl(href)

      btnlist.push({
        cid,
        vid: obj.vid,
        href: obj.href,
        text,
        mark: '',
      })
    })

  return btnlist
}

function processUrl(url) {
  const reg = /cover\/(.*)\.html/
  const match = reg.exec(url)
  let href = url
  let cid = ''
  let vid = ''
  if (url.includes('search_redirect.html')) {
    const params = href.split('?')[1]
    const searchParams = new URLSearchParams(`?${params}`)
    href = searchParams.get('url') || ''
    cid = searchParams.get('cid') || ''
  } else if (match) {
    const arr = match[1].split('/')
    cid = arr[0]
    vid = arr[1] || ''
  }
  return {
    href,
    cid,
    vid,
  }
}

module.exports = homeApi