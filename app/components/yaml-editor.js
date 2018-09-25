import Component from '@ember/component';
import $ from 'jquery';

export default Component.extend({
  tagName: '',

  // FIXME Is there no way to bind to scrollTop? 😐
  didRender() {
    this._super(...arguments);

    $('textarea').scroll((e) => {
      $('.annotation').css('margin-top', -e.target.scrollTop);

      let containerHeight = $('.annotations').outerHeight();
      let anyAbove = false, anyBelow = false;

      $('.annotation').each((index, element) => {
        if (element.offsetTop < 0) anyAbove = true;
        if (element.offsetTop + element.offsetHeight > containerHeight) anyBelow = true;
      });

      $('.annotations').toggleClass('any-above', anyAbove).toggleClass('any-below', anyBelow);
    });
  }
});
