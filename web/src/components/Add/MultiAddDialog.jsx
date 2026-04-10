import { useState, useEffect, useCallback } from 'react'
import Button from '@material-ui/core/Button'
import { torrentUploadHost } from 'utils/Hosts'
import axios from 'axios'
import { useTranslation } from 'react-i18next'
import { useMediaQuery, TextField, FormControl, FormHelperText, Select, MenuItem, IconButton } from '@material-ui/core'
import CircularProgress from '@material-ui/core/CircularProgress'
import { Delete as DeleteIcon } from '@material-ui/icons'
import { ButtonWrapper } from 'style/DialogStyles'
import { StyledDialog, StyledHeader } from 'style/CustomMaterialUiStyles'
import useOnStandaloneAppOutsideClick from 'utils/useOnStandaloneAppOutsideClick'
import { TORRENT_CATEGORIES } from 'components/categories'
import { NoImageIcon } from 'icons'
import { useQuery } from 'react-query'
import { getTorrents } from 'utils/Utils'
import useChangeLanguage from 'utils/useChangeLanguage'
import parseTorrent from 'parse-torrent'
import { parseTorrentTitle, checkImageURL, getMoviePosters } from './helpers'
import { MultiFileRow, MultiFilePoster, MultiFileInfo, MultiFileList } from './style'

function FileRow({ file, fileState, onUpdate, onRemove, existingTorrents }) {
  const { t } = useTranslation()
  const [currentLang] = useChangeLanguage()

  const handleTitleChange = ({ target: { value } }) => onUpdate({ title: value })
  const handleCategoryChange = ({ target: { value } }) => onUpdate({ category: value })
  const handlePosterChange = ({ target: { value } }) => {
    onUpdate({ poster: value })
    checkImageURL(value).then(ok => onUpdate({ isPosterOk: ok }))
  }

  useEffect(() => {
    // Extract infohash and check for duplicates
    parseTorrent.remote(file, (err, parsed) => {
      if (!err && parsed?.infoHash) {
        const existing = existingTorrents.find(tor => tor.hash === parsed.infoHash)
        if (existing) {
          const updates = { infoHash: parsed.infoHash, alreadyExists: true }
          if (existing.title) updates.title = existing.title
          if (existing.category) updates.category = existing.category
          if (existing.poster) {
            updates.poster = existing.poster
            updates.isPosterOk = true
          }
          onUpdate(updates)
          return
        }
        onUpdate({ infoHash: parsed.infoHash })
      }
    })

    // Parse title and search poster
    const posterLang = currentLang === 'ru' ? 'ru' : 'en'
    parseTorrentTitle(file, ({ parsedTitle, originalName }) => {
      if (!originalName) return
      onUpdate({ originalName, parsedTitle: parsedTitle || '' })

      const searchTitle = parsedTitle || originalName
      if (searchTitle) {
        getMoviePosters(searchTitle, posterLang).then(urls => {
          if (urls && urls.length > 0) {
            checkImageURL(urls[0]).then(ok => {
              if (ok) onUpdate({ poster: urls[0], isPosterOk: true })
            })
          }
        })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  return (
    <MultiFileRow alreadyExists={fileState.alreadyExists}>
      <MultiFilePoster>
        {fileState.isPosterOk ? (
          <img src={fileState.poster} alt='poster' />
        ) : (
          <NoImageIcon style={{ opacity: 0.3, width: 40, height: 40 }} />
        )}
      </MultiFilePoster>

      <MultiFileInfo>
        <div className='file-name'>{file.name}</div>

        {fileState.alreadyExists && (
          <div className='file-warning'>{t('AddDialog.HashExists')}</div>
        )}

        {fileState.originalName && !fileState.alreadyExists && (
          <div className='file-original-name'>{fileState.originalName}</div>
        )}

        <TextField
          onChange={handleTitleChange}
          value={fileState.title}
          margin='dense'
          label={t('AddDialog.TitleBlank')}
          type='text'
          variant='outlined'
          fullWidth
          size='small'
        />

        <TextField
          onChange={handlePosterChange}
          value={fileState.poster}
          margin='dense'
          label={t('AddDialog.AddPosterLinkInput')}
          type='url'
          variant='outlined'
          fullWidth
          size='small'
        />

        <FormControl fullWidth size='small' style={{ marginTop: 4 }}>
          <FormHelperText style={{ padding: '0 0.5em' }}>
            {t('AddDialog.CategoryHelperText')}
          </FormHelperText>
          <Select
            value={fileState.category}
            margin='dense'
            onChange={handleCategoryChange}
            variant='outlined'
            fullWidth
            defaultValue=''
          >
            <MenuItem value=''><em>—</em></MenuItem>
            {TORRENT_CATEGORIES.map(cat => (
              <MenuItem key={cat.key} value={cat.key}>
                {t(cat.name)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </MultiFileInfo>

      <IconButton size='small' onClick={onRemove}>
        <DeleteIcon fontSize='small' />
      </IconButton>
    </MultiFileRow>
  )
}

export default function MultiAddDialog({ files, handleClose }) {
  const { t } = useTranslation()
  const fullScreen = useMediaQuery('@media (max-width:930px)')
  const ref = useOnStandaloneAppOutsideClick(handleClose)
  const [isSaving, setIsSaving] = useState(false)

  const { data: torrents } = useQuery('torrents', getTorrents, { retry: 1 })
  const existingTorrents = torrents || []

  const [fileList, setFileList] = useState(() =>
    files.map(f => ({
      file: f,
      title: '',
      category: '',
      poster: '',
      isPosterOk: false,
      originalName: '',
      parsedTitle: '',
      infoHash: '',
      alreadyExists: false,
    }))
  )

  const handleUpdate = useCallback((index, updates) => {
    setFileList(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item))
  }, [])

  const handleRemove = useCallback((index) => {
    setFileList(prev => {
      const next = prev.filter((_, i) => i !== index)
      if (next.length === 0) handleClose()
      return next
    })
  }, [handleClose])

  const handleSaveAll = () => {
    setIsSaving(true)
    const uploads = fileList.map(item => {
      const data = new FormData()
      data.append('save', 'true')
      data.append('file', item.file)
      item.title && data.append('title', item.title)
      item.poster && data.append('poster', item.poster)
      item.category && data.append('category', item.category)
      return axios.post(torrentUploadHost(), data).catch(() => {})
    })
    Promise.all(uploads).finally(handleClose)
  }

  return (
    <StyledDialog open onClose={handleClose} fullScreen={fullScreen} fullWidth maxWidth='md' ref={ref}>
      <StyledHeader>
        {t('AddNewTorrent')} ({fileList.length})
      </StyledHeader>

      <MultiFileList>
        {fileList.map((item, index) => (
          <FileRow
            // eslint-disable-next-line react/no-array-index-key
            key={item.file.name + index}
            file={item.file}
            fileState={item}
            onUpdate={updates => handleUpdate(index, updates)}
            onRemove={() => handleRemove(index)}
            existingTorrents={existingTorrents}
          />
        ))}
      </MultiFileList>

      <ButtonWrapper>
        <Button onClick={handleClose} color='secondary' variant='outlined'>
          {t('Cancel')}
        </Button>

        <Button
          variant='contained'
          style={{ minWidth: '110px' }}
          disabled={fileList.length === 0}
          onClick={handleSaveAll}
          color='secondary'
        >
          {isSaving ? <CircularProgress style={{ color: 'white' }} size={20} /> : `${t('Add')} (${fileList.length})`}
        </Button>
      </ButtonWrapper>
    </StyledDialog>
  )
}
