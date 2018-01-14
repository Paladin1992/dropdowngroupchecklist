/*!
    Widget Name: DropdownGroupChecklist
    Version: 0.1
    Author: Gergely Marosvolgyi
    (c) 2017-2018

    Help: <url here>
*/

/*
    Syntax:
    $(selectedElement).dropdownGroupChecklist({ data: array [, options: object] });
 
    all options:
        placeholder
            description :   A text to display when nothing is set in the control.
            type        :   string
            default     :   '' (empty)

        ??? //////////////////////
        arrowRotate
            description :   Toggles arrow rotation animation.
            type        :   boolean
            default     :   false
        ??? //////////////////////

        maxDropHeight
            description :   The maximum visible height of the dropdown container in pixels.
                            If content would overflow, a vertical scrollbar is displayed.
            type        :   integer (pixels)
            default     :   200

        indent
            description :   The distance in pixels a list item should be offset, relative to its direct parent (=group header).
            type        :   integer (pixels)
            default     :   15

        allowIndeterminate
            description :   By default, if a list item becomes unchecked, all of its ancestor groups become unchecked as well.
                            If allowIndeterminate is set to true, checkboxes for a group can have a third state: indeterminate.
                            It works as follows:
                            - If ALL of the sub-items are checked in a group, then the group header also becomes checked.
                            - If NONE of the sub-items are checked in a group, then the group header also becomes unchecked.
                            - If only SOME of the sub-items are checked or indeterminate in a group, then the group header
                              (and all of its parent group headers as well) becomes indeterminate.
            type        :   boolean
            default     :   false

        checkAllItem
            description :   If specified, a zeroth item will appear for (un)checking all items.
            type        :   object
            default     :   null
            properties  :   - text  :   A caption for the item; default is "(All)"
                            - value :   A value for the item for server-side scripting and such; default is 0 (zero).
            sample      :   { text: '(Check All)', value: -1 }

        dropdownEffect
            description :   Specifies the dropdown effect for the list's container when the <select> input field is clicked.
            type        :   object
            default     :   { effect: "drop", speed: "normal" }
            parameters  :   - effect:   "drop" | "slide" | "fade"
                            - speed :   "normal" | "slow" | "fast" | milliseconds
*/

/*
    TO DO:
    - calculate dropdown's direction: up or down
    - dropdown effect could be set to toggle/slideToggle with milliseconds (via function?)
    - user-defined callback functions for certain events in the widget
        itemClick
        dropdownOpening
        dropdownOpened
        dropdownClosing
        dropdownClosed
*/

'use strict';

(function($) {

    // widget info
    const WIDGET_VERSION = '0.1';

    // default values
    const DEFAULT_PLACEHOLDER = '';
    const DEFAULT_MAX_DROP_HEIGHT = 200; // pixels
    const DEFAULT_INDENT = 15; // pixels
    const DEFAULT_ALLOW_INDETERMINATE = false;
    const DEFAULT_CHECK_ALL_ITEM_TEXT = '(All)';

    // prefixes
    const PREFIX_DDGCL = 'ddgcl';
    const PREFIX_CHECKBOX = PREFIX_DDGCL + '-chbx-'; // 'ddgcl-chbx-'

    // CSS selectors
    const CSS_DDGCL = 'ddgcl';
    const CSS_SELECT = 'ddgcl-select';
    const CSS_TEXT = 'ddgcl-text';
    const CSS_ARROW_WRAPPER = 'ddgcl-arrow-wrapper';
    const CSS_ARROW_UP = 'fa fa-angle-up';
    const CSS_ARROW_DOWN = 'fa fa-angle-down';
    const CSS_DROPDOWN = 'ddgcl-dropdown';
    const CSS_LIST = 'ddgcl-list';
    const CSS_CHECKBOX = 'input[type="checkbox"]';
    const CSS_CHECK_ALL_ITEM = 'ddgcl-check-all-item';
    const CSS_GROUP_HEADER = 'ddgcl-group-header';
    const CSS_GROUP_CHECKBOX = 'ddgcl-group-checkbox';
    const CSS_ITEM = 'ddgcl-item';
    
    const SCROLLBAR_WIDTH = (function() {
        var outer = document.createElement("div");
        outer.style.visibility = "hidden";
        outer.style.width = "100px";

        document.body.appendChild(outer);

        var widthWithoutScroll = outer.offsetWidth;
        outer.style.overflow = "scroll"; // force scrollbars

        // add inner div
        var inner = document.createElement("div");
        inner.style.width = "100%";
        outer.appendChild(inner);

        var widthWithScroll = inner.offsetWidth;

        // remove divs
        outer.parentNode.removeChild(outer);

        return widthWithoutScroll - widthWithScroll;
    })();

    const checkState = {
        unchecked: 0,
        indeterminate: 1,
        checked: 2
    };

    const dropdownEffect = {
        drop: 'drop',
        slide: 'slide',
        fade: 'fade'
    };

    $.fn.textWidth = function() {
        // wrap content temporarily into a <span>
        // (an inline <span> won't fill the whole available space like <div>)
        var $span = $('.ddgcl-temporary-text-wrapper');

        if ($span.length === 0) { // if doesn't exist yet
            $span = $('<span class="ddgcl-temporary-text-wrapper">');
            $('body').append($span); // the <span> must exist in the DOM to render
        }
        
        $span.css({
            'visibility': 'hidden',
            'white-space': 'nowrap'
        });
        
        // overwrite <span>'s innerHTML with the content of the selected element
        $span.html( $(this).html() );

        // get the total width of the span, including padding, border, and margin
        return $span.outerWidth(true);
    };

    $.fn.getBoundary = function() {
        if (this.get(0) === window) {
            var w = window.innerWidth;
            var h = window.innerHeight;

            return {
                element: window,
                rect: {
                    top: 0,
                    right: w,
                    bottom: h,
                    left: 0,

                    width: w,
                    height: h,
                    x: 0,
                    y: 0
                }
            };
        }

        var result = [];
        this.each(function() {
            result.push({
                element: this,
                rect: this.getBoundingClientRect()
            });
        });
        return (result.length === 1 ? result[0] : result);
    };


    $.widget('ui.dropdownGroupChecklist', {
        version: WIDGET_VERSION,

        _options: {},

        /*
            $widgetSpan
                $selectSpan
                    $textSpan
                    $arrowSpan
            $dropdown
                $list
        */
        $widgetSpan: null,
        $selectSpan: null,
        $textSpan: null,
        $arrowSpan: null,
        $arrowIcon: null,
        $dropdown: null,
        $list: null,

        isOpen: false,

        _isObject: function(obj) {
            return (!Array.isArray(obj) && typeof obj !== "function" && obj === Object(obj));
        },

        // e.g. '100px' --> 100
        _removeUnits: function(value) {
            return (value ? parseInt(value.toString().replace(/\D/g, '')) : 0);
        },

        // depth is the count of separators (dots) in the level string (zero is the root level)
        // e.g.
        //   level="2"     --> 0 dots --> we are on the 0th (root) level
        //   level="1.4.3" --> 2 dots --> we are on the 2nd level
        _getDepth: function(level) {
            if (!level) {
                return 0;
            }

            return level.split('').reduce(function(count, current) {
                return (current === '.' ? count + 1 : count);
            }, 0);
        },

        _createCheckbox: function(innerHTML, level, checked, classes) {
            // a <ul> list shouldn't be wrapped inside a <label>
            // because group headers are also inserted inside <li> elements,
            // so in this case we just simply return with the innerHTML itself
            if (innerHTML.trim().substr(0, 3) === '<ul') {
                return innerHTML;
            }

            var self = this;
            var level = (level || '0').replace(/\./g, '_'); // replace dot (.) characters with underscore (_) to avoid conflicts

            // checkbox
            var chbx = $('<input type="checkbox">');
            var id = PREFIX_DDGCL + '_' + self.uuid + '-' + level; // e.g. first (0th) widget on site, 2.1.3 item --> "ddgcl_0-2_1_3"
            chbx.attr('id', id);
            chbx.attr('name', id);
            chbx.addClass(classes || '');
            // prop() sets the checked property but it won't be in the outerHTML, so we use attr() instead:
            chbx.attr('checked', (checked ? true : false));

            // label
            var label = $('<label>');
            label.attr('for', id);
            label.append(chbx).append(innerHTML);

            return label.get(0).outerHTML;
        },

        _createListItem: function(innerHTML, level, classes) {
            var self = this;
            var li = $('<li>');

            if (level) {
                // data-level attribute, e.g.: data-level="1.2.3"
                li.attr('data-level', level);

                // data-depth attribute, e.g.: data-depth="2"
                var depth = self._getDepth(level);
                li.attr('data-depth', depth);
            }

            // classes
            li.addClass(classes);

            // indent
            var indent = self._options.indent * depth;
            if (innerHTML.trim().substr(0, 3) !== '<ul') { // avoid multiple padding-left stacking
                li.css({'padding-left': indent + 'px'});
                
                if (!li.hasClass(CSS_GROUP_HEADER)) {
                    li.addClass(CSS_ITEM);
                }
            }

            // innerHTML
            li.html( self._createCheckbox(
                innerHTML,
                level,
                true, // checked
                li.hasClass(CSS_GROUP_HEADER) ? CSS_GROUP_CHECKBOX : null) // classes
            );
            
            return li.get(0).outerHTML;
        },

        _processOptGroup: function(optGroupObject, level) {
            if (!optGroupObject) {
                return '';
            }

            var self = this;
            var text = "";
            var items = [];
            var isOptGroup = false;

            if (self._isObject(optGroupObject)) {
                var optGroup = optGroupObject || { text: "", items: [] };
                text = optGroup.text || "";
                items = optGroup.items || [];
                isOptGroup = (items.length > 0);
            } else {
                items = optGroupObject || [];
                isOptGroup = false;
            }
                
            var result = '';
            for (var i = 0; i < items.length; i++) {
                var newLevel = (level
                                ? level + '.' + (i + 1)
                                : (i + 1).toString());

                if (self._isObject(items[i])) { // sub-group
                    result += self._processOptGroup(items[i], newLevel);
                } else { // single item
                    result += self._createListItem(items[i], newLevel);
                }        
            }

            if (isOptGroup) {
                result = '<ul>' + self._createListItem(text, level, CSS_GROUP_HEADER) + result + '</ul>';
                
                // <ul> is not allowed as a direct child of another <ul>, so we put it into a <li>
                result = self._createListItem(result, null);
            } else if (items.length === 0) {
                result += self._createListItem(text, level);
            }

            return result;
        },
        
        _getCheckStates: function($checkboxes) {
            var self = this;
            var counts = {
                unchecked: 0,
                indeterminate: 0,
                checked: 0
            };

            $checkboxes.each(function() {
                var chbx = $(this);
                var checked = chbx.prop('checked');
                var indeterminate = (self._options.allowIndeterminate && chbx.prop('indeterminate'));

                if (checked) {
                    counts.checked++;
                } else {
                    if (indeterminate) {
                        counts.indeterminate++;
                    } else {
                        counts.unchecked++;
                    }
                }
            });

            return counts;
        },

        _getCheckStateOfGroup: function($groupUl) {
            // the items we seek are one level below the group header (i.e. targetDepth = groupDepth + 1)
            var targetDepth = parseInt($groupUl.children('li.' + CSS_GROUP_HEADER).attr('data-depth')) + 1;
            var directChildrenCheckboxes = $groupUl.find('li[data-depth=' + targetDepth + '] ' + CSS_CHECKBOX);
            var counts = this._getCheckStates(directChildrenCheckboxes);

            // all are checked
            if (counts.checked === directChildrenCheckboxes.length) {
                return checkState.checked;
            }

            // all are unchecked
            if (counts.unchecked === directChildrenCheckboxes.length) {
                return checkState.unchecked;
            }

            // otherwise mixed
            return (this._options.allowIndeterminate ? checkState.indeterminate : checkState.unchecked);
        },

        _calculateDropdownWidth: function() {
            var self = this;
            var removeUnits = self._removeUnits;
            var labels = self.$list.find(`li.` + CSS_CHECK_ALL_ITEM + ` label, 
                                          li.` + CSS_GROUP_HEADER + ` label,
                                          li.` + CSS_ITEM + ` label`);

            var width = 0;

            labels.each(function() {
                var label = $(this);
                var li = label.parent();

                var sidePadding = removeUnits(li.css('padding-left')) + removeUnits(li.css('padding-right'));
                var sideBorder = removeUnits(li.css('border-left-width')) + removeUnits(li.css('border-right-width'));
                var sideMargin = removeUnits(li.css('margin-left')) + removeUnits(li.css('margin-right'));
                var labelWidth = label.textWidth();
                var currentWidth = labelWidth + sidePadding + sideBorder + sideMargin;
                
                if (currentWidth > width) {
                    width = currentWidth;
                }
            });

            return width;
        },

        _calculateDropdownHeight: function() {
            var self = this;
            var maxDropHeight = self._options.maxDropHeight;
            return maxDropHeight;
            //var maxDropCount = self._options.maxDropCount;
            //var lineHeight = self._removeUnits( window.getComputedStyle(document.querySelector('.ddgcl')).lineHeight );

            /*
                if both are specified:
                    dropHeight === dropCount  -->  return dropHeight
                    dropHeight  >  dropCount  -->  return (preferDropCount ? dropCount : dropHeight)
                    dropHeight  <  dropCount  -->  return (preferDropCount ? dropCount : dropHeight)
                
                if exactly one of them is specified:
                    if dropHeight --> return dropHeight
                    if dropCount  --> return maxDropCount * lineHeight

                if none of them are specified:
                    return DEFAULT_MAX_DROP_HEIGHT
            */
        },

        _onBlur: function() {
            setTimeout(function() {
                var focusedElement = $(document.activeElement);
                if (focusedElement.is(self.$dropdown) || self.$dropdown.has(focusedElement).length) {
                    // if self or child --> still focused
                    console.log('still focused');
                } else { // other element --> lost focus
                    console.log('lost focus');
                    self.$dropdown.css({'visibility': 'hidden'});
                }
            }, 0);
        },

        _createDropdown: function() {
            var self = this;

            // the "Check All" item
            var checkAllItemOption = self._options.checkAllItem;
            var str = (checkAllItemOption
                       ? self._createListItem(checkAllItemOption.text, null, CSS_CHECK_ALL_ITEM)
                       : '');

            // generate the whole grouped list
            self.$list = $('<ul>')
                .addClass(CSS_LIST)
                .append(str + self._processOptGroup(self.options.data, ''));

            // dropdown is the list wrapped in a <div>
            return $('<div>').append(self.$list);
        },

        _initOptions: function() {
            var self = this;
            var options = self.options.options;

            // placeholder
            self._options.placeholder = (options.placeholder && typeof options.placeholder === 'string'
                                         ? options.placeholder
                                         : DEFAULT_PLACEHOLDER);

            // maxDropHeight
            self._options.maxDropHeight = (options.maxDropHeight && options.maxDropHeight >= 0
                                           ? options.maxDropHeight
                                           : DEFAULT_MAX_DROP_HEIGHT);

            // indent
            self._options.indent = (options.indent && options.indent >= 0
                                    ? options.indent
                                    : DEFAULT_INDENT);

            // allowIndeterminate
            self._options.allowIndeterminate = (options.allowIndeterminate || DEFAULT_ALLOW_INDETERMINATE);

            // checkAllItem
            var checkAll = options.checkAllItem;
            if (self._isObject(checkAll) ? Object.keys(checkAll).length > 0 : checkAll) {
                self._options.checkAllItem = { // set user-defined values if possible, otherwise set defaults
                    text: options.checkAllItem.text || DEFAULT_CHECK_ALL_ITEM_TEXT,
                    value: options.checkAllItem.value || 0
                };
            } else {
                self._options.checkAllItem = null;
            }

            // dropdownEffect
            var effectObj = options.dropdownEffect;
            var validEffect = 'drop'; // default
            var validSpeed = 1000;

            if (self._isObject(effectObj)) {
                // check effect
                var effectsArray = $.map(dropdownEffect, function(value) {
                    return [value];
                });

                if ($.inArray(effectObj.effect, effectsArray) !== -1) {
                    validEffect = effectObj.effect;
                }

                // check speed
                var speed = effectObj.speed;
                switch (speed) {
                    case 'slow': validSpeed = 2000; break;
                    case 'normal': validSpeed = 1000; break;
                    case 'fast': validSpeed = 500; break;
                    default: validSpeed = 1000; break;
                }
            }

            self._options.dropdownEffect = {
                effect: validEffect,
                speed: validSpeed
            };
        },

        // initializes the plugin (jQuery UI widget function)
        _init: function() {
            var self = this;
            self._initOptions();

            /*
                // structure:
                <span class="ddgcl"> // $widgetSpan
                    <span class="ddgcl-select"> // $selectSpan
                        <span class="ddgcl-text">text</span> // $textSpan
                        <span class="ddgcl-arrow-wrapper"> // $arrowSpan
                            <i class="fa fa-angle-down"></i>
                        </span>
                    </span>
                </span>

                <div class="ddgcl-dropdown"> // $dropdown
                    <ul class="ddgcl-list"> // $list
                        // list
                    </ul>
                </div>
            */

            // fake select
            self.$arrowIcon = $('<i>').addClass(CSS_ARROW_DOWN);
            
            self.$textSpan = $('<span>').addClass(CSS_TEXT).text(self._options.placeholder);
            self.$arrowSpan = $('<span>').addClass(CSS_ARROW_WRAPPER).append(self.$arrowIcon);
            
            self.$selectSpan = $('<span>')
                .css({
                    'display': 'inline-block',
                    'overflow': 'hidden',
                    'position': 'relative',
                    'z-index': 0
                })
                .addClass(CSS_SELECT)
                .append(self.$textSpan, self.$arrowSpan);
            self.$widgetSpan = $('<span>').addClass(CSS_DDGCL).append(self.$selectSpan);

            // dropdown
            self.$dropdown = self._createDropdown().addClass(CSS_DDGCL);
            
            // widget is being applied to an existing select
            if (self.element.is('select')) {
                // insert after <select>, hide <select>
                self.$widgetSpan.insertAfter(self.element);
                self.$dropdown.insertAfter(self.$widgetSpan);
                self.element.hide();
            } else { // something else
                // insert into parent element
                self.element.append(self.$widgetSpan, self.$dropdown);
            }

            // to get or set the size of the rendered elements,
            // they must exist in the DOM, that's why they are set later
            var calculatedDropdownHeight = self._calculateDropdownHeight();
            var scrollHeight = self.$dropdown.get(0).scrollHeight;
            var dropdownHeight = Math.min(calculatedDropdownHeight, scrollHeight + 2);

            // width must be set later, as we need to know whether the vertical scrollbar appears or not
            var scrollbarWidth = (scrollHeight + 2 > calculatedDropdownHeight ? SCROLLBAR_WIDTH : 0);
            var calculatedDropdownWidth = self._calculateDropdownWidth() + scrollbarWidth;
            var scrollWidth = self.$dropdown.get(0).scrollWidth;
            var dropdownWidth = Math.min(calculatedDropdownWidth, scrollWidth + 2);
            
            self.$dropdown
                .attr('tabindex', 0)
                .css({
                    'min-width': calculatedDropdownWidth + 'px',
                    'width': dropdownWidth + 'px', // essential to set, otherwise the <div> would fill the available space
                    'max-height': calculatedDropdownHeight + 'px',
                    'height': dropdownHeight + 'px',
                    'position': 'absolute',
                    'overflow-x': 'hidden', // never show horizontal scrollbar
                    'overflow-y': 'auto', // show vertical scrollbar only when necessary
                    'visibility': 'hidden',
                    'white-space': 'nowrap',
                    'z-index': 1
                })
                .addClass(CSS_DROPDOWN);

            // list is appended to the DOM, we can now access the "Check All" checkbox
            self.$checkAllCheckbox = self.$dropdown.find('.' + CSS_CHECK_ALL_ITEM + ' ' + CSS_CHECKBOX);

            // assign click event on the labels in the dropdown
            self.$dropdown.find('label').on('click', function(e) {
                e.stopImmediatePropagation();
                
                var label = $(this);
                var li = label.closest('li');

                if (li.hasClass(CSS_CHECK_ALL_ITEM)) { // "Check All"
                    self.$dropdown.find(CSS_CHECKBOX)
                        .prop('checked', self.$checkAllCheckbox.prop('checked'))
                        .prop('indeterminate', false);
                } else { // not checkAll item
                    var itemCheckState = label.find(CSS_CHECKBOX).prop('checked');

                    if (li.hasClass(CSS_GROUP_HEADER)) { // if group header
                        // (un)check all children
                        li.parent().find(CSS_CHECKBOX)
                          .prop('indeterminate', false)
                          .prop('checked', itemCheckState);
                    }

                    var parentGroups = li.parentsUntil('.' + CSS_LIST, 'ul');
                    var forceIndeterminate = false;

                    // iterate through the parents and set their check states according to that of their children
                    for (var index = 0; index < parentGroups.length; index++) {
                        var $groupUl = $(parentGroups.get(index));
                        var groupCheckState = self._getCheckStateOfGroup($groupUl);
                        var $groupCheckboxes = $groupUl.children('li.' + CSS_GROUP_HEADER).find(CSS_CHECKBOX);

                        if (self._options.allowIndeterminate) {
                            if (!forceIndeterminate && groupCheckState === checkState.indeterminate) {
                                forceIndeterminate = true;
                            }

                            $groupCheckboxes
                                .prop('indeterminate', (forceIndeterminate || groupCheckState === checkState.indeterminate))
                                .prop('checked', (!forceIndeterminate && groupCheckState === checkState.checked));
                        } else {
                            $groupCheckboxes
                                .prop('indeterminate', false)
                                .prop('checked', groupCheckState === checkState.checked);
                        }
                    }
                }

                // if all the checkboxes are checked, "Check All" becomes checked;
                // if at least one unchecked or indeterminate is found, "Check All" becomes unchecked
                // ("Check All" can never be in indeterminate state)
                var checkboxes = self.$dropdown.find('li:not(.' + CSS_CHECK_ALL_ITEM + ') ' + CSS_CHECKBOX);
                
                // change the state of checkAll
                self.$checkAllCheckbox.prop('checked', (self._getCheckStates(checkboxes).checked === checkboxes.length));
            });

            /*self.$dropdown.on('focus', function() {
                console.log('dropdown onfocus');
            }).on('blur', function() {
                console.log('dropdown onblur');
                self._onBlur(self.$dropdown);
            });*/

            /*self.$dropdown.find(':focusable').on('blur', function() {
                self._onBlur();
            });*/

            self.$selectSpan.on('click', function(e) {
                //e.preventDefault();
                //e.stopImmediatePropagation();

                if (self.isOpen) { // open -> close
                    self.$dropdown.css('visibility', 'hidden');
                    self.$arrowIcon.removeClass(CSS_ARROW_UP).addClass(CSS_ARROW_DOWN);
                } else { // closed -> open
                    var selectRect = self.$selectSpan.getBoundary().rect;

                    if (selectRect.bottom + dropdownHeight < window.innerHeight) { // down
                        // dropdown's top left corner goes to the bottom left corner of <select>
                        self.$dropdown.css({
                            'top': selectRect.bottom,
                            'left': selectRect.left
                        });
                    } else { // up
                        // dropdown's bottom left corner goes to the top left corner of <select>
                        self.$dropdown.css({
                            'top': selectRect.top - selectRect.height,
                            'left': selectRect.left
                        });
                    }

                    self.$dropdown.css('visibility', 'visible').focus();
                    self.$arrowIcon.removeClass(CSS_ARROW_DOWN).addClass(CSS_ARROW_UP);
                }

                self.isOpen = !self.isOpen;
            });

            // remove the <span> element from the DOM being used for determining the width of a text
            $('.ddgcl-temporary-text-wrapper').remove();
        }
    }); // widget

})(jQuery);