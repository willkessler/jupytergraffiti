define([
  'jupytergraffiti/js/state.js',
], function (state) {
  const localizer = {  
    defaultLanguage: 'EN',
    language: 'EN',

    getLanguage: () => {
      return localizer.language;
    },

    setLanguage: (language) => {
      if (language !== undefined) {
        localizer.language = language;
      } else {
        localizer.language = localizer.defaultLanguage;
      }
    },

    getString: (token) => {
      if (localizer.translations.hasOwnProperty(localizer.language)) {
        if (localizer.translations[localizer.language].hasOwnProperty(token)) {
          if (localizer.translations[localizer.language][token].length > 0) {
            // console.log('localized, for ' + token + ' returning ' , localizer.translations[localizer.language][token]);
            return localizer.translations[localizer.language][token];
          } else {
            // console.log('unlocalized, for ' + token + ' returning ' , localizer.translations[localizer.defaultLanguage][token]);
            return localizer.translations[localizer.defaultLanguage][token];
          }
        }
      }
      // Cant find the string, just return the token so it's obvious it needs translation
      return token;
    },

    loadLocale: (locale) => {
      switch (locale) {
        case 'EN':
          localizer.translations['EN'] = {
            'ENABLE_GRAFFITI':                   'Enable Graffiti',
            'ACTIVATE_GRAFFITI':                 'Activate Graffiti',
            'GRAFFITI_PRESENT':                  'Graffiti is present on this line to the left.',
            'MOVIE_UNAVAILABLE':                 'Movie is not available.',
            'MOVIE_UNAVAILABLE_EXPLANATION':     'We are sorry, we could not load this movie at this time. Please contact the author of this Notebook for help.',
            'FILE_UNAVAILABLE':                  'File unavailable',
            'FILE_UNAVAILABLE_EXPLANATION':      'The file you requested with <i>%%insert_data_from_file</i> was not found.',
            'ACTIVATE_GRAFFITI_CONFIRM':         'Activate Graffiti On This Notebook?',
            'CREATE_1':                          'Create',
            'CREATE_2':                          'Record',
            'EDIT' :                             'Edit',
            'EDIT_TOOLTIP' :                     'Edit Tooltip / Graffiti Settings',
            'START_RECORDING':                   'Start Recording',
            'END_RECORDING':                     'End Recording',
            'RECORD' :                           'Record',
            'RECORD_MOVIE' :                     'Record movie',
            'RERECORD':                          'Rerecord',
            'RERECORD_MOVIE':                    'Rerecord movie',
            'START_PLAYBACK':                    'Start playback',
            'PAUSE_PLAYBACK':                    'Pause playback (spacebar)',
            'EXIT_PLAYBACK':                     'Exit movie (restore notebook contents)',
            'MUTE':                              'Mute audio',
            'UNMUTE':                            'Unmute audio',
            'HIGH_SPEED_PLAYBACK':               'Switch to high speed playback',
            'REGULAR_SPEED_PLAYBACK':            'Switch to regular speed playback',
            'HIGH_SPEED_SILENCES':               'High Speed during silences',
            'REGULAR_SPEED_SILENCES':            'Regular Speed during silences',
            'SKIP_BACK':                         'Skip back',
            'SKIP_FORWARD':                      'Skip forward',
            'TO_PREVIOUS_SENTENCE':              'to previous sentence',
            'TO_NEXT_SENTENCE':                  'to next sentence',
            'SECONDS':                           'second',
            'SAVE_GRAFFITI':                     'Save Graffiti',
            'CLEANUP_TAKES':                     'Cleanup Takes',
            'REMOVE_GRAFFITI':                   'Remove Graffiti',
            'BELOW_TYPE_MARKDOWN':               "%% Below, type any markdown to display in the Graffiti tip.\n" +
                                                 "%% Then run this cell to save it.\n",
            'SAMPLE_API':                        'Create Sample API Calls',
            'SKIPS_API':                         'Fast Forwards / Skips',
            'SKIPS_DIALOG_TITLE':                'Remove Fast Forwards & Skips on This Recording?',
            'SKIPS_DIALOG_BODY':                 'This will remove all fast forwards and skips you have set. Are you positive?',
            'SKIPS_DIALOG_CONFIRM_1':            'Proceed',
            'SKIPS_DIALOG_CANCEL':               'Cancel',
            'SKIPS_HEADER':                      'Fast Forwards & Skips',
            'SKIPS_COMPRESS_BTN':                'Compress time to fixed length',
            'SKIPS_2X_BTN':                      'Set to fast forward at 2x speed',
            'SKIPS_3X_BTN':                      'Set to fast forward at 3x speed',
            'SKIPS_4X_BTN':                      'Set to fast forward at 4x speed',
            'SKIPS_COMPRESS_BTN':                'Compress time to fixed length',
            'SKIPS_ABSOLUTE_BTN':                'Skip a section entirely',
            'SKIPS_CLEAR_BTN':                   'Remove all skips',
            'TAKES':                             'Takes',
            'SELECT_SOME_TEXT_MARKDOWN' :        'Select some text in this Markdown cell to add or modify Graffiti, or click inside any existing Graffiti text to modify it.',
            'EDIT_IN_MARKDOWN_CELL' :            'Edit the Markdown cell to add or modify Graffiti in the cell, or use Graffiti Extras (below)',
            'SELECT_SOME_TEXT_PLAIN' :           'Select some text in a cell to create or modify Graffiti, click inside any existing Graffiti text to modify that Graffiti, ' +
                                                 'or use Graffiti Extras (below)',
            'YOU_CAN_PLAY_VIA_TOOLTIP' :         'You can play this movie any time via its tooltip.',
            'NO_MOVIE_RECORDED_YET' :            'No movie has been recorded for this Graffiti yet.',
            'PLEASE_WAIT_STORING_MOVIE' :        'Please wait, storing this movie...',
            'YOU_CAN_FILTER' :                   'You can filter this Notebook\'s Graffiti by clicking on creators in the list below.',
            'PAUSE_TO_INTERACT' :                '<span class="graffiti-notifier-link" id="graffiti-pause-link">Pause</span> (or scroll the page) to interact with this Notebook',
            'CANCEL_MOVIE_PLAYBACK_1' :          '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-link">Cancel</span> movie playback (Esc)',
            'CANCEL_MOVIE_PLAYBACK_2' :          '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-postreset-link">Cancel</span> movie playback (Esc)',
            'CANCEL_MOVIE_PLAYBACK_3' :          '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-prereset-link">Cancel</span> movie playback (Esc)',
            'PLAY_MOVIE_AGAIN' :                 '<span class="graffiti-notifier-link" id="graffiti-restart-play-link">Play movie again</span>',
            'CONTINUE_MOVIE_PLAYBACK' :          '<span class="graffiti-notifier-link" id="graffiti-continue-play-link">Continue</span> movie playback',
            'ENTER_AND_SAVE' :                   'Enter the markdown you want to be displayed in the Graffiti and then click "Save Graffiti"  (or just run the label cell).',
            'CANCEL_CHANGES_1' :                 'Or, <span class="graffiti-notifier-link" id="graffiti-cancel-graffiting-link">Cancel changes</span>',
            'CANCEL_CHANGES_2' :                 'Or, <span class="graffiti-notifier-link" id="graffiti-cancel-recording-labelling-link">Cancel changes</span>',
            'ENTER_MARKDOWN_MOVIE_DESCRIPTION' : 'Enter markdown to describe your movie, then click "Start Recording" (or just run the label cell).',
            'CLICK_BEGIN_MOVIE_RECORDING' :      'Click anywhere in the notebook to begin recording your movie.',
            'CANCEL_RECORDING_1' :               'Or, <span class="graffiti-notifier-link" id="graffiti-cancel-recording-pending-link">Cancel recording</span>',
            'CANCEL_RECORDING_2' :               'Or, <span class="graffiti-notifier-link" id="graffiti-cancel-recording-link">Cancel recording</span>',
            'RECORDING_HINT_1' :                 '<div class="graffiti-keyboard-sim"><div>option/alt</div><div>key</div></div>',
            'RECORDING_HINT_2' :                 '<span>Tap</span>: Pause Rec.',
            'RECORDING_HINT_3' :                 '<span>Hold</span>: End Rec.',
            'RECORDING_HINT_4' :                 '<div class="graffiti-keyboard-sim" style="color:red;"><div>Skipping</div><div>(option/alt to resume)</div></div>',
            'IS_SKIPPING' :                      '--:--',
            'ACTIVITIES_BEING_RECORDED':         'Your activities are being recorded. Hold the option key down to end recording.',
            'LOADING':                           'Loading... (ESC to cancel)',
            'LOADING_PLEASE_WAIT':               'Loading Graffiti movie, please wait...',
            'RECORDED_ON':                       'Recorded',
            'PRESS_ESC_TO_END_MOVIE_PLAYBACK' :  'Press ESC to end movie playback',
            'SHOW_GRAFFITI_EDITOR':              'Show Graffiti Editor',
            'HIDE_GRAFFITI_EDITOR':              'Hide Graffiti Editor',
            'ENTER_LABEL':                       'Enter a label...',
            'FREEFORM_PEN_TOOL' :                'Freeform pen tool',
            'HIGHLIGHTER_TOOL':                  'Highlighter tool',
            'ERASER_TOOL':                       'Eraser tool',
            'USE_DISAPPEARING_INK':              'Use disappearing ink',
            'USE_DASHED_LINES':                  'Use dashed lines',
            'DASHED_LINES':                      'Dashed lines',
            'TEMPORARY_INK':                     'Temporary Ink',
            'SOLID_FILL':                        'Solid Fill',
            'SHIFT_KEY_ALIGN':                   'Shift-key: align items to grid / keep items square',
            'PLAY_CONFIRM':                      'Are you sure you want to play this Graffiti?',
            'REPLACE_CONFIRM_BODY_1':            'This Graffiti movie may replace the contents of code cells. After this movie plays, do you want to...',
            'REPLACE_CONFIRM_BODY_2':            'Restore Cell Contents After Playback Ends',
            'REPLACE_CONFIRM_BODY_3':            'Let this Movie Permanently Set Cell Contents',
            'ACCESS_MICROPHONE_PROMPT':          'Please grant access to your browser\'s microphone.',
            'ACCESS_MICROPHONE_ADVISORY':        'You cannot record Graffiti movies unless you grant access to the microphone. ' +
                                                 'Please <a href="https://support.google.com/chrome/answer/2693767?co=GENIE.Platform%3DDesktop&hl=en" ' +
                                                 'target="_">grant access</a> and then reload this page.',
            'ACTIVATE_GRAFFITI_ADVISORY':        'Enable Graffiti on this Notebook, so you can begin using Graffiti for the first time?<br>' +
                                                 'If you click Cancel, we will not change the notebook in any way.' +
                                                 '<br><br><i>(This process merely adds some metadata to the cells, but does not otherwise change the Notebook\'s contents.)</i>',
            'SCRUB':                             'scrub',
            'TOOLTIP_HINT':                      'Without moving your mouse, click now to watch a movie about this.',
            'MOVIE_DURATION':                    'Movie duration',
            'INSERT_GRAFFITI_BUTTON_CELL':       '+ Insert Graffiti Button',
            'INSERT_GRAFFITI_BUTTON_CELL_ALT_TAG': 'Insert a Graffiti-enabled button',
            'INSERT_GRAFFITI_TERMINAL':          '+ Insert Graffiti Terminal',
            'INSERT_GRAFFITI_TERMINAL_ALT_TAG': 'Insert a Graffiti-enabled terminal',
            'INSERT_GRAFFITI_TERMINAL_SUITE':    '+ Insert Terminal Suite',
            'INSERT_GRAFFITI_TERMINAL_SUITE_ALT_TAG': 'Insert a code cell + terminal + button',
            'INSERT_TERMINAL_SUITE_STATUS':      'Inserting a terminal suite, please wait...',
            'JUMP_TO_NOTEBOOK_DIR':              'Jump to Notebook\'s Dir',
            'RESET_TERMINAL':                    'Reset',
            'CELL_EXECUTES_GRAFFITI':            'Code Cell, Executes Graffiti',
            'CELL_EXECUTE_CHOICE':               'Now click on the element that contains the Graffiti you want this cell to run...',
            'CELL_EXECUTE_CHOICE_SET':           'Your choice has been saved.',
            'ACTIVATE_LOCK_ALT_TAG':             'Lock/unlock all markdown cells',
            'CHANGE_DATADIR_TAG':                'Change home directory for Graffiti data',
            'CREATE_SHOWHIDE_BUTTON':            'Create show/hide button from this cell',
            'LOCK_VERB':                         'Lock',
            'UNLOCK_VERB':                       'Unlock',
            'UNLOCK_BODY':                       'This will unlock all markdown cells so you can edit them (note: terminal cells are always locked).',
            'LOCK_BODY':                         'This will lock all markdown cells so they can no longer be edited.',
            'LOCK_CONFIRM':                      'markdown cells in notebook?',
            'DATA_PATH_INSTRUCTIONS':            "### Change Data Path?\n" +
                                                 "You can tell Graffiti to store its data in another folder/path. " +
                                                 "In the code cell below, put the _relative_ path to the folder where you want to store Graffiti data, " +
                                                 "including the folder name and a trailing slash. " +
                                                 "For example, suppose you want Graffiti to store its data one folder up in a directory called `graffitibits`. " +
                                                 "Then you should enter `../graffitibits/` here. " +
                                                 '(The default value is `jupytergraffiti_data/`, a folder in the same directory as this Notebook.)' +
                                                 "\n\n" +
                                                 "_Please Note:_ \n\n" +
                                                 "* If you are unsure what to do, don't change the path and just hit the _Confirm_ button.\n" +
                                                 "* If the data folder does not exist, Graffiti will create it when you create your first Graffiti for the notebook.\n" +
                                                 "* Any Graffiti recorded previously in a different path will become unavailable. \n" +
                                                 "* This cell, the path cell and Confirm button cell below will be automatically removed from the Notebook after you " +
                                                 "click _Confirm_.",
            'ACCEPTED_DATADIR_HEADER':           'Your new path for Graffiti has been accepted',
            'ACCEPTED_DATADIR_BODY':             "Your Graffiti path has been changed. Now you must reload your notebook. \n\nYou can change this setting any time with " +
                                                 'the Data Directory button on the Graffiti Editor panel.',
            'SAFARI_WARNING':                    '<span style="color:red;font-weight:bold;">Warning: </span>Graffiti Audio will not work in Safari. (Please use Chrome, Firefox, ' +
                                                 'or Edge instead.)',
          }
          break;
        case 'CN':
          localizer.translations['CN'] = {          
            'ENABLE_GRAFFITI':                   '启用 Graffiti',
            'ACTIVATE_GRAFFITI':                 '开始使用 Graffiti ',
            'GRAFFITI_PRESENT':                  '本行有 Graffiti ，请查阅',
            'MOVIE_UNAVAILABLE':                 '视频不存在',
            'MOVIE_UNAVAILABLE_EXPLANATION':     '抱歉，我们目前无法加载该视频。请联系创建该 Notebook 的作者寻求帮助。',
            'FILE_UNAVAILABLE':                  'File unavailable',
            'FILE_UNAVAILABLE_EXPLANATION':      'The file you requested with `%%insert_data_from_file` was not available',
            'ACTIVATE_GRAFFITI_CONFIRM':         '是否在该 Notebook 上启用 Graffiti？',
            'CREATE_1':                          '创建',
            'CREATE_2':                          '创建',
            'EDIT' :                             '编辑',
            'EDIT_TOOLTIP' :                     '编辑 Graffiti 提示框',
            'START_RECORDING':                   '开始录屏',
            'END_RECORDING':                     '结束录屏',
            'RECORD' :                           '录屏',
            'RECORD_MOVIE' :                     '录制视频',
            'RERECORD':                          '重录',
            'RERECORD_MOVIE':                    '重新录制',
            'START_PLAYBACK':                    '开始回放',
            'PAUSE_PLAYBACK':                    '终止回放 (spacebar)',
            'EXIT_PLAYBACK':                     'Exit movie (restore notebook contents)',
            'MUTE':                              '静音',
            'UNMUTE':                            '取消静音',
            'HIGH_SPEED_PLAYBACK':               '快速回放',
            'REGULAR_SPEED_PLAYBACK':            '正常回放',
            'HIGH_SPEED_SILENCES':               '无人说话的片段快速播放',
            'REGULAR_SPEED_SILENCES':            '无人说话的片段正常播放',
            'SKIP_BACK':                         '快退',
            'SKIP_FORWARD':                      '快进',
            'TO_PREVIOUS_SENTENCE':              '到前一句',
            'TO_NEXT_SENTENCE':                  '到下一句',
            'SECONDS':                           '秒',
            'SAVE_GRAFFITI':                     '保留 Graffiti ',
            'CLEANUP_TAKES':                     'Cleanup Takes',
            'REMOVE_GRAFFITI':                   '移除 Graffiti ',
            'BELOW_TYPE_MARKDOWN':               '在以下输入 markdown 文本，将展示在 Graffiti 中。' +
                                                 '然后运行文本以保存。',
            'SAMPLE_API':                        '创建示例 API Calls',
            'SKIPS_API':                         'Fast Forwards / Skips',
            'SKIPS_DIALOG_TITLE':                'Remove Fast Forwards & Skips on This Recording?',
            'SKIPS_DIALOG_BODY':                 'This will remove all fast forwards and skips you have set. Are you positive?',
            'SKIPS_DIALOG_CONFIRM_1':            'Proceed',
            'SKIPS_DIALOG_CANCEL':               'Cancel',
            'SKIPS_HEADER':                      'Fast Forwards & Skips',
            'SKIPS_COMPRESS_BTN':                'Compress time to fixed length',
            'SKIPS_2X_BTN':                      'Set to fast forward at 2x speed',
            'SKIPS_3X_BTN':                      'Set to fast forward at 3x speed',
            'SKIPS_4X_BTN':                      'Set to fast forward at 4x speed',
            'SKIPS_COMPRESS_BTN':                'Compress time to fixed length',
            'SKIPS_ABSOLUTE_BTN':                'Skip a section entirely',
            'SKIPS_CLEAR_BTN':                   'Remove all skips',
            'TAKES':                             '版本',
            'SELECT_SOME_TEXT_MARKDOWN' :        '选择文本以创建或者修改 Graffiti，或者点击已有的 Graffiti 进行修改',
            'EDIT_IN_MARKDOWN_CELL' :            'Edit the Markdown cell to add or modify Graffiti in the cell, or use Graffiti Extras (below)',
            'SELECT_SOME_TEXT_PLAIN' :           'Select some text in a cell to create or modify Graffiti, click inside any existing Graffiti text to modify that Graffiti, ' +
                                                 'or use Graffiti Extras (below)',
            'YOU_CAN_PLAY_VIA_TOOLTIP' :         '你可以通过提示框随时播放此视频',
            'NO_MOVIE_RECORDED_YET' :            'No movie has been recorded for this Graffiti yet.',
            'PLEASE_WAIT_STORING_MOVIE' :        '稍等，视频存储中...',
            'YOU_CAN_FILTER' :                   '点击列表里的创建者，筛选 Notebook 里的 Graffiti',
            'PAUSE_TO_INTERACT' :                '<span class="graffiti-notifier-link" id="graffiti-pause-link">暂停</span>（或者下拉页面），可以继续在 Notebook 上的操作',
            'CANCEL_MOVIE_PLAYBACK_1' :          '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-link">取消</span>视频回放（或者使用 Esc 按键）',
            'CANCEL_MOVIE_PLAYBACK_2' :          '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-postreset-link">取消</span>视频回放（或者使用 Esc 按键）',
            'CANCEL_MOVIE_PLAYBACK_3' :          '<span class="graffiti-notifier-link" id="graffiti-cancel-playback-prereset-link">取消</span>视频回放（或者使用 Esc 按键）',
            'PLAY_MOVIE_AGAIN' :                 '<span class="graffiti-notifier-link" id="graffiti-restart-play-link">重新播放视频</span>',
            'CONTINUE_MOVIE_PLAYBACK' :          '<span class="graffiti-notifier-link" id="graffiti-continue-play-link">继续</span>回放视频',
            'ENTER_AND_SAVE' :                   '输入你想在 Graffiti 里展示的文本内容，完成后点击“保存 Graffiti”（或者运行单元格以保存）',
            'CANCEL_CHANGES_1' :                 '或者<span class="graffiti-notifier-link" id="graffiti-cancel-graffiting-link">取消更改</span>',
            'CANCEL_CHANGES_2' :                 '或者<span class="graffiti-notifier-link" id="graffiti-cancel-recording-labelling-link">取消更改</span>',
            'ENTER_MARKDOWN_MOVIE_DESCRIPTION' : '输入视频描述文字，点击“开始录屏”（或者运行单元格以开始）',
            'CLICK_BEGIN_MOVIE_RECORDING' :      '点击 Notebook 的任何一处，开始录屏',
            'CANCEL_RECORDING_1' :               '或者<span class="graffiti-notifier-link" id="graffiti-cancel-recording-pending-link">取消录制</span>',
            'CANCEL_RECORDING_2' :               '或者<span class="graffiti-notifier-link" id="graffiti-cancel-recording-link">取消录制</span>',
            'RECORDING_HINT_1' :                 '<div class="graffiti-keyboard-sim"><div>option/alt</div><div>key</div></div>',
            'RECORDING_HINT_2' :                 '<span>Tap</span>: Pause Rec.',
            'RECORDING_HINT_3' :                 '<span>Hold</span>: End Rec.',
            'RECORDING_HINT_4' :                 '<div class="graffiti-keyboard-sim" style="color:red;"><div>Skipping</div><div>(option/alt to resume)</div></div>',
            'IS_SKIPPING' :                      '--:--',
            'ACTIVITIES_BEING_RECORDED':         '录屏进行中' +
                                                 '按键 ⌘-M 或者点击<span class="graffiti-notifier-link" id="graffiti-end-recording-link">结束录屏</span> ' +
                                                 '以终止录制',
            'LOADING':                           '加载中 (ESC to cancel)',
            'LOADING_PLEASE_WAIT':               '正在加载 Graffiti 视频，请稍等...',
            'RECORDED_ON':                       '已录制',
            'PRESS_ESC_TO_END_MOVIE_PLAYBACK' :  '按键 ESC 结束视频回放',
            'SHOW_GRAFFITI_EDITOR':              '显示 Graffiti 编辑器',
            'HIDE_GRAFFITI_EDITOR':              '隐藏 Graffiti 编辑器',
            'ENTER_LABEL':                       '创建标签',
            'FREEFORM_PEN_TOOL' :                '自由图形画笔',
            'HIGHLIGHTER_TOOL':                  '高亮工具',
            'ERASER_TOOL':                       '橡皮擦',
            'USE_DISAPPEARING_INK':              '使用渐消墨水',
            'USE_DASHED_LINES':                  '使用虚线',
            'DASHED_LINES':                      '虚线',
            'TEMPORARY_INK':                     '渐消墨水',
            'SOLID_FILL':                        '填充图形',
            'SHIFT_KEY_ALIGN':                   '按住 Shift 键，图形自动对齐',
            'PLAY_CONFIRM':                      '是否确认播放该 Graffiti 视频？',
            'REPLACE_CONFIRM_BODY_1':            '播放 Graffiti 视频可能会更改代码单元格内容，你可以选择在播放后',
            'REPLACE_CONFIRM_BODY_2':            '还原之前的单元格内容',
            'REPLACE_CONFIRM_BODY_3':            '允许视频更新单元格内容',
            'ACCESS_MICROPHONE_PROMPT':          '请允许使用目前浏览器的麦克风',
            'ACCESS_MICROPHONE_ADVISORY':        '请允许使用麦克风，否则无法录屏' +
                                                 '请 <a href="https://help.aircall.io/hc/en-gb/articles/115001425325-How-to-allow-Google-Chrome-to-access-your-microphone" ' +
                                                 'target="_">允许使用</a>并重新加载该页面',
            'ACTIVATE_GRAFFITI_ADVISORY':        '在该 Notebook 上启用 Graffiti，就能进行录屏操作啦' +
                                                 '如果点击取消，不会更改 notebook' +
                                                 '<br><br><i>(该操作只会增加单元格的元数据，不会更改 Notebook 的内容)</i>',
            'SCRUB':                             'scrub',
            'TOOLTIP_HINT':                      'Click the underlined text (below) to watch a movie about this.',
            'MOVIE_DURATION':                    'Movie duration',
            'INSERT_GRAFFITI_BUTTON_CELL':       '+ Graffiti Button',
            'INSERT_GRAFFITI_BUTTON_CELL_ALT_TAG': 'Insert a Graffiti-enabled button',
            'INSERT_GRAFFITI_TERMINAL':          '+ Terminal',
            'INSERT_GRAFFITI_TERMINAL_ALT_TAG': 'Insert a Graffiti-enabled terminal',
            'INSERT_GRAFFITI_TERMINAL_SUITE':    '+ Terminal Suite',
            'INSERT_GRAFFITI_TERMINAL_SUITE_ALT_TAG': 'Insert a code cell + terminal + button',
            'INSERT_TERMINAL_SUITE_STATUS':      'Inserting a terminal suite, please wait...',
            'JUMP_TO_NOTEBOOK_DIR':              'Jump to Notebook\'s Dir',
            'RESET_TERMINAL':                    'Reset',
            'CELL_EXECUTES_GRAFFITI':            'Code Cell, Executes Graffiti',
            'CELL_EXECUTE_CHOICE':               'Now click on the element that contains the Graffiti you want this cell to run...',
            'CELL_EXECUTE_CHOICE_SET':           'Your choice has been saved.',
            'ACTIVATE_LOCK_ALT_TAG':             'Lock/unlock all markdown cells',
            'CHANGE_DATADIR_TAG':                'Change home directory for Graffiti data',
            'CREATE_SHOWHIDE_BUTTON':            'Create show/hide button from this cell',
            'LOCK_VERB':                         'Lock',
            'UNLOCK_VERB':                       'Unlock',
            'UNLOCK_BODY':                       'This will unlock all markdown cells so you can edit them (note: terminal cells are always locked).',
            'LOCK_BODY':                         'This will lock all markdown cells so they can no longer be edited.',
            'LOCK_CONFIRM':                      'markdown cells in notebook?',
            'DATA_PATH_INSTRUCTIONS':            "### Change Data Path?\n" +
                                                 "You can tell Graffiti to store its data in another folder/path. " +
                                                 "In the code cell below, put the _relative_ path to the folder where you want to store Graffiti data, " +
                                                 "including the folder name and a trailing slash. " +
                                                 "For example, suppose you want Graffiti to store its data one folder up in a directory called `graffitibits`. " +
                                                 "Then you should enter `../graffitibits/` here. " +
                                                 '(The default value is `jupytergraffiti_data/`, a folder in the same directory as this Notebook.)' +
                                                 "\n\n" +
                                                 "_Please Note:_ \n\n" +
                                                 "* If you are unsure what to do, don't change the path and just hit the _Confirm_ button.\n" +
                                                 "* If the data folder does not exist, Graffiti will create it when you create your first Graffiti for the notebook.\n" +
                                                 "* Any Graffiti recorded previously in a different path will become unavailable. \n" +
                                                 "* This cell, the path cell and Confirm button cell below will be automatically removed from the Notebook after you " +
                                                 "click _Confirm_.",
            'ACCEPTED_DATADIR_HEADER':           'Your new path for Graffiti has been accepted',
            'ACCEPTED_DATADIR_BODY':             "Your Graffiti path has been changed. Now you must reload your notebook. \n\nYou can change this setting any time with " +
                                                 'the Data Directory button on the Graffiti Editor panel.',
            'SAFARI_WARNING':                    '<span style="color:red;font-weight:bold;">Warning: </span>Graffiti Audio will not work in Safari. (Please use Chrome, Firefox, ' +
                                                 'or Edge instead.)',
          };
          break;
      }
    },

    init: () => {
      localizer.translations = {};
      localizer.loadLocale('EN');
      localizer.loadLocale('CN');

      const notebook = Jupyter.notebook;
      localizer.setLanguage('EN');
      if (notebook.metadata.hasOwnProperty('graffiti')) {
        if (notebook.metadata.graffiti.hasOwnProperty('language')) {
          localizer.setLanguage(notebook.metadata.graffiti.language);
        }
      }

// Load localized strings for China. Paths not working right now, so we're using an inline solution instead, see above
/*      
      return new Promise((resolve) => {
        requirejs(['/nbextensions/graffiti_extension/js/locales/cn/strings.js'], function (strings) {
          console.log('Fetched lang strings');
          localizer.translations['CN'] = strings.getTranslations();
          console.log('we loaded chinese translations.');
          //localizer.setLanguage('CN');
          resolve();
        });
      });
*/

      return Promise.resolve();

    },

  };

  return (localizer);

});
