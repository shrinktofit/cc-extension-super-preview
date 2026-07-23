System.register([], function (_export) {
  'use strict';

  return {
    execute: function () {
      var element = document.querySelector('#super-preview-config');
      if (!element || !element.textContent) {
        throw new Error('[Super Preview] Config was not embedded');
      }

      var config;
      try {
        config = JSON.parse(element.textContent);
      } catch (error) {
        throw new Error('[Super Preview] Embedded config is invalid', {
          cause: error,
        });
      }

      _export('launchParams', Object.freeze(config.launchParams));
    },
  };
});
