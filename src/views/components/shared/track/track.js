import React, { Component } from 'react';
import PropTypes from 'prop-types';
import Electron from 'electron';
import ClassNames from 'classnames';

import PlaylistManager from '../../../../modules/PlaylistManager';
import Notifier from '../../../modules/Notifier';
import Player from '../../../modules/Player';

import TrackList from './track-list';
import TrackSquare from './track-square';
import TabManager from '../../../modules/TabManager';

import BasePlaylist from 'kaku-core/models/playlist/BasePlaylist';
import { DragSource, DropTarget } from 'react-dnd';
import ItemTypes from './ItemTypes';

const Remote = Electron.remote;
const Menu = Remote.Menu;
const MenuItem = Remote.MenuItem;

const trackSource = {
  beginDrag (props) {
    return {
      id: props.id,
      index: props.index,
    }
  },
}
const trackTarget = {

  hover (props, monitor, component) {
    const dragIndex = monitor.getItem().index
    const hoverIndex = props.index

    if (dragIndex === hoverIndex) {
      return
    }

    const hoverBoundingRect = ReactDOM.findDOMNode(component).getBoundingClientRect()
    const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2
    const clientOffset = monitor.getClientOffset()
    const hoverClientY = clientOffset.y - hoverBoundingRect.top

    if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
      return
    }
    if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
      return
    }

    Track.moveTrack(dragIndex, hoverIndex)

    monitor.getItem().index = hoverIndex
  },
}
function collectdrop (connect, monitor) {
  return {
    connectDropTarget: connect.dropTarget(),
  }
}
function collectdrag (connect, monitor) {
  return {
    connectDragSource: connect.dragSource(),
    isDragging: monitor.isDragging()
  }
}

class Track extends Component {
  constructor(props) {
    super(props);

    this.state = {
      playingTrack: {}
    };

    this._setPlayingTrack = this._setPlayingTrack.bind(this);
    this._createContextMenu = this._createContextMenu.bind(this);
    Track.moveTrack = Track.moveTrack.bind(this);	  
  }

  componentDidMount() {
    Player.on('play', this._setPlayingTrack);
  }

  componentWillUnmount() {
    Player.off('play', this._setPlayingTrack);
  }

  _setPlayingTrack() {
    this.setState({
      playingTrack: Player.playingTrack
    });
  }

  _clickToPlay(track) {
    if (TabManager.tabName === 'play-queue') {
      let index = this.props.index;
      Player.playNextTrack(index);
    }
    else {
      let noUpdate = true;
      Player.cleanupTracks(noUpdate);
      Player.addTracks([track]);
      Player.playNextTrack(0);
    }
  }
  static moveTrack (dragIndex, hoverIndex) {
    let playlists = PlaylistManager.playlists;
    let temp = [];
    let dragTrack;

    playlists.forEach((playlist) => {
      BasePlaylist.prototype.swapTracks = function (tracks) {
        var promise = new Promise((resolve) => {
          if (this._tracks.length <= 0) {
            return Promise.resolve();
          } else {
            temp = this._tracks.slice(0);

            dragTrack = this.tracks[dragIndex];

            let onetrackplaylist = [];
            onetrackplaylist.push(dragTrack);

            this.tracks.splice(dragIndex, 1);
            this.tracks.splice(hoverIndex, 0, onetrackplaylist[0]);

            this.emit('tracksUpdated');

            if (PlaylistManager.activePlaylist.isSameWith(playlist)) {
              Player.randomIndexes = Player.makeRandomIndexes(Player.tracks.length);
              if (Player.randomIndexes.length === temp.length) {
                let playingIndex = this.tracks.indexOf(Player.playingTrack);
                if (playingIndex === dragIndex) {
                  let noUpdate = true;
                  Player.cleanupTracks(noUpdate);
                  Player.addTracks(this.tracks);
                  Player.playNextTrack(playingIndex, Player.playingTrackTime);
                } else {
                  let noUpdate = true;
                  Player.cleanupTracks(noUpdate);
                  Player.addTracks(this.tracks);
                }
              }
            } else {
              return;
            }
          }

          resolve();
        }

        );
        return promise;
      }
      if (PlaylistManager.activePlaylist.isSameWith(playlist)) {
        playlist
          .swapTracks()
          .catch((error) => {
            Notifier.alert(error);
          });
      }
    }
    )
  }

  _clickToShowContextMenu(track, event) {
    // TODO
    // if we are under playlist section already,
    // we should not shown this context menu
    event.preventDefault();
    let menu = this._createContextMenu(track);
    menu.popup(Remote.getCurrentWindow(), {
      async: true
    });
  }

  _createContextMenu(track) {
    let menu = new Menu();
    let playlists = PlaylistManager.playlists;

    playlists.forEach((playlist) => {
      let clickToAddTrack = ((playlist) => {
        return () => {
          playlist
            .addTrack(track)
            .catch((error) => {
              Notifier.alert(error);
            });
        };
      })(playlist);

      let clickToRemoveTrack = ((playlist) => {
        return () => {
          playlist
            .removeTrack(track)
            .catch((error) => {
              Notifier.alert(error);
            });
        };
      })(playlist);
    
      // TODO
      // add l10n support here
      let menuItemToAddTrack = new MenuItem({
        label: `Add to ${playlist.name}`,
        click: clickToAddTrack
      });

      let menuItemToRemoveTrack = new MenuItem({
        label: `Remove from ${playlist.name}`,
        click: clickToRemoveTrack
      });
      
      if (PlaylistManager.isDisplaying) {
        if (PlaylistManager.activePlaylist.isSameWith(playlist)) {
          menu.append(menuItemToRemoveTrack);
        }
        else {
          menu.insert(0, menuItemToAddTrack);
        }
      }
      else {
        // TODO
        // we have to check if this track does exist in this playlist,
        // but no matter how, right now we have internal protect in
        // playlist.addTrack() to make sure we won't add the same track
        // to the same playlist.
        menu.insert(0, menuItemToAddTrack);
      }
    });
    return menu;
  }

  render() {
      const {
      connectDragSource,
      connectDropTarget,
    } = this.props	  
	  
    let mode = this.props.mode;
    let track = this.props.data;
    let trackClassName = ClassNames({
      track: true,
      'track-square': (mode === 'square'),
      'track-list': (mode === 'list'),
      active: track.isSameTrackWith(this.state.playingTrack)
    });

    let iconObject = {};
    iconObject.fa = true;

    switch (track.trackType) {
      case 'YoutubeTrack':
        iconObject['fa-youtube'] = true;
        break;

      case 'VimeoTrack':
        iconObject['fa-vimeo'] = true;
        break;

      case 'SoundCloudTrack':
        iconObject['fa-soundcloud'] = true;
        break;

      case 'MixCloudTrack':
        iconObject['fa-mixcloud'] = true;
        break;

      default:
        iconObject['fa-music'] = true;
        break;
    }

    let iconClassName = ClassNames(iconObject);
    let trackUI;
    let trackProps = {
      track: track,
      moveTrack: Track.moveTrack.bind(this, track),	    
      onClick: this._clickToPlay.bind(this, track),
      onContextMenu: this._clickToShowContextMenu.bind(this, track),
      iconClassName: iconClassName,
      trackClassName: trackClassName
    };

    // We will dispatch do different views here based on incoming mode
    if (mode === 'square') {
      trackUI = <TrackSquare {...trackProps} />;
    }
    else if (mode === 'list') {
      trackUI = <TrackList {...trackProps} />;
    }

    return connectDragSource(
      connectDropTarget(<div>{trackUI}</div>)
    )
  }
}

Track.propTypes = {
  connectDragSource: PropTypes.func.isRequired,
  connectDropTarget: PropTypes.func.isRequired,
  isDragging: PropTypes.bool.isRequired,	    
  data: PropTypes.object.isRequired,
  mode: PropTypes.string,
  index: PropTypes.number
};

Track.defaultProps = {
  data: {},
  mode: 'square',
  index: -1
};

const x = DropTarget(ItemTypes.TRACK, trackTarget, collectdrop)(Track)
module.exports = DragSource(ItemTypes.TRACK, trackSource, collectdrag)(x);
