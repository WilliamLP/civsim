"use strict";

var app = app || {};

app.TileGridView = Backbone.View.extend({
    el: $("#tile-grid"),
    tileTemplate: _.template($('#city-tile-template').html()),
    events: {
        "click .city-tile": "editTile"
    },
    render: function() {
        var tileOutputs = [];
        for(var x=0; x<5; x++) {
            var col = []
            for(var y=0;  y<5; y++) {
                var renderedTile = this.tileTemplate(this.model.tileGrid.getTile(x,y));
                tileOutputs.push(renderedTile);
            }
        }

        this.$el.html(tileOutputs.join(''));
        return this;
    },
    initialize: function(opts) {
        this.editTilePopupView = new app.EditTilePopupView({});
        if (opts.model) {
            this.setModel(opts.model);
        }
    },
    setModel: function (model) {
        this.stopListening();
        this.model = model;
        this.listenTo(this.model.tileGrid, "change", this.render);
        this.listenTo(this.model.city, "change", this.render);
        this.render();
    },
    editTile: function(e) {
        var $el = $(e.currentTarget);
        var x = parseInt($el.attr('data-x'));
        var y = parseInt($el.attr('data-y'));

        this.editTilePopupView.popup(this.model, x, y);
    }
});

app.EditTilePopupView = Backbone.View.extend({
    el: $("#tile-popup"),
    template: _.template($('#edit-tile-template').html()),

    events: {
        "hide.bs.modal": "closeView",
        'click .btn[name="Commerce"]': "calcNetCommerce",
        'change .cottage-turn-input': "calcNetCommerce",
        'click .new-cottage-button': "newCottage"
    },
    initialize: function() {
        this.render();
    },
    render: function() {
        this.$('.modal-body').html(this.template({}));
    },
    popup: function(model, x, y) {
        this.model = model;
        this.tile = model.tileGrid.getTile(x, y);
        this.stopListening();

        this.$el.modal('show');
        this.$('.btn[name="Food"][value="' + this.tile.f + '"]').button('toggle');
        this.$('.btn[name="Prod"][value="' + this.tile.h + '"]').button('toggle');
        this.$('.btn[name="Commerce"][value="' + this.tile.c + '"]').button('toggle');
        this.$('.cottage-turn-input').val(this.tile.ct);
        this.calcNetCommerce();

        return this;
    },
    calcNetCommerce: function(e) {
        var c = parseInt(this.$('.btn.active[name="Commerce"]').attr('value'));
        if (e && $(e.target).is('.btn[name="Commerce"]')) {
            // Hack: Get the button from the click, because there seems to be no useful event for a Bootstrap radio button change. (?)
            c = parseInt($(e.target).attr('value'));
        }
        var ct = parseInt(this.$('.cottage-turn-input').val());
        this.$('.net-commerce-text').text(this.model.tileGrid.netCommerce(c, ct));
    },
    newCottage: function(e) {
        console.log('new cottage');
        this.$('.cottage-turn-input').val('0');
        this.calcNetCommerce();
    },
    closeView: function() {
        var f = parseInt(this.$('.btn.active[name="Food"]').attr('value'));
        var h = parseInt(this.$('.btn.active[name="Prod"]').attr('value'));
        var c = parseInt(this.$('.btn.active[name="Commerce"]').attr('value'));
        var ct = parseInt(this.$('.cottage-turn-input').val());
        if (isNaN(ct)) {
            ct = null;
        }

        if (this.tile.f != f || this.tile.h != h || this.tile.c != c || this.tile.ct != ct) {
            this.model.tileGrid.setTile(this.tile.x, this.tile.y, {"f": f, "h": h, "c": c, "ct": ct});
            this.model.city.propagateTileChanges(this.model.index);
        }
    }
});

app.TileSelectPopupView = Backbone.View.extend({
    tileTemplate: _.template($('#city-tile-template').html()),
    el: $("#tile-select-popup"),
    events: {
        "hide.bs.modal": "closeView",
        "click button": "toggleTile"
    },
    popup: function(model) {
        this.model = model;

        this.render();

        this.$el.modal('show');
        return this;
    },
    render: function() {
        this.$('#modal-tile-grid').empty();
        for(var x=0; x<5; x++) {
            var col = []
            for(var y=0;  y<5; y++) {
                var renderedTile = this.tileTemplate(this.model.tileGrid.getTile(x,y));
                this.$('#modal-tile-grid').append(renderedTile);

                if (this.model.isTileSelected(x,y)) {
                    this.$('button[data-x=' + x + '][data-y=' + y + ']').removeClass('btn-default').addClass('btn-success');
                }
            }
        }

    },
    initialize: function() {
    },
    closeView: function() {

    },
    toggleTile: function(e) {
        var btn = this.$(e.target);
        var x = parseInt(btn.attr('data-x'));
        var y = parseInt(btn.attr('data-y'));

        if (btn.hasClass('btn-default')) {
            if (this.model.selectTile(x,y)) {
                btn.removeClass('btn-default').addClass('btn-success');
            }
        } else {
            if (this.model.unselectTile(x,y)) {
                btn.removeClass('btn-success').addClass('btn-default');
            }
        }
    }
});

app.BuildSelectPopupView = Backbone.View.extend({
    template: _.template($('#build-select-template').html()),
    el: $("#build-select-popup"),
    events: {
        "change select[name='build-preset']": "selectPreset",
        "hide.bs.modal": "closeView"
    },
    popup: function(model) {
        this.model = model;

        this.render();

        this.$el.modal('show');
        return this;
    },
    render: function() {
        this.$('.modal-body').html(this.template({presets: app.BuildPresets, build: this.model.build}));
    },
    initialize: function() {
    },
    selectPreset: function(e) {
        var buildName = this.$('option:selected').text();
        var selectedPreset = this.model.buildPresetForName(buildName);

        if (selectedPreset) {
            this.$('input[name="build-name"]').val(selectedPreset.name);
            this.$('input[name="build-hammers"]').val(selectedPreset.hammers);
            this.$('input[name="build-bonus"]').val(selectedPreset.bonus);
        }
    },
    closeView: function() {
        var buildName = this.$('input[name="build-name"]').val();
        var buildHammers = parseInt(this.$('input[name="build-hammers"]').val()) || 0;
        var buildBonus = parseInt(this.$('input[name="build-bonus"]').val()) || 0;

        this.model.setBuild({name: buildName, hammers: parseInt(buildHammers), bonus: parseInt(buildBonus)});
    }
});

app.ActionSelectPopupView = Backbone.View.extend({
    template: _.template($('#action-select-template').html()),
    el: $("#action-select-popup"),
    events: {
        "change select": "closeView"
    },
    popup: function(model) {
        console.log('pop');
        this.model = model;

        this.render();

        this.$el.modal('show');
        return this;
    },
    render: function() {
        this.$('.modal-body').html(this.template({presets: app.ActionPresets}));
    },
    initialize: function() {
    },
    closeView: function() {
        var actionCode = this.$('option:selected').val();
        if (actionCode) {
            this.model.addAction(actionCode);
        }

        this.$el.modal('hide');
    }
});

app.CityTurnView = Backbone.View.extend({
    tagName: 'tr',
    className: 'city-turn-row',
    template: _.template($('#city-turn-template').html()),
    events: {
    },
    tilesWorkedString: function() {
        var tileStrings = [];
        var selected = this.model.selectedTileList();
        $.each(selected, function(k, v) {
            if (v.x == 2 && v.y == 2) {
                return;
            }
            var tileString = v.f + '/' + v.h + '/' + v.netCommerce;
            tileStrings.push(tileString);
        });
        tileStrings.sort(function(a,b) { return b > a; });
        return tileStrings.length ? tileStrings.join(', ') : "(none)";
    },
    noteString: function() {
        var notes = [];
        var info = this.model.info();

        if (this.model.index > 0 && this.model.tileGrid.cottageGrowth(this.model.prev.tileGrid)) {
            notes.push("Cottage grew.");
        } else if (this.model.index > 0 && !this.model.tileGrid.equals(this.model.prev.tileGrid)) {
            // Don't show tile yield change message since it would be redundant most of the time.
            notes.push("Tile yields changed.");
        }
        if (info.food + info.foodSurplus >= info.foodToGrow) {
            notes.push("Growing to size " + (info.pop + 1) + ".");
        }
        if (info.build.name && !this.model.hasRevolt() && info.hammers == 0) {
            notes.push("Starting " + info.build.name + ".");
        }
        if (info.build.name && info.hammers + info.hammersProduced >= info.build.hammers) {
            notes.push("Finishing " + info.build.name + ".");
        }
        return notes.join(' ');
    },
    actionString: function() {
        var result = [];
        var model = this.model;
        $.each(this.model.actions, function(k, actionCode) {
            result.push(model.actionPresetForCode(actionCode).name);
        });

        return result.join(', ');
    },
    render: function() {
        var viewParams = this.model.info();

        viewParams['tilesWorked'] = this.tilesWorkedString();
        viewParams['notes'] = this.noteString();
        viewParams['validTiles'] = (this.model.get('pop') + 1 == this.model.numberSelected());
        viewParams['actionString'] = this.actionString();

        this.$el.html(this.template(viewParams));
        this.$el.attr('data-cid', this.model.cid);
        return this;
    }
});

app.CityView = Backbone.View.extend({
    el: $("#city"),

    events: {
        "click .city-turn-row": "selectRow",
        "click .tile-select": "selectTiles",
        "click .build-select": "selectBuild",
        "click .action-select": "selectAction",
        "change #city-header-form": "changeCity",

        "click .user-note-cell": "showUserNoteEdit",
        "blur .user-note-edit": "hideUserNoteEdit",
        "change .user-note-edit": "changeUserNote",

        "click #save-city": "save",
        "click #load-city": "load"
    },
    initialize: function() {
        this.tileGridView = new app.TileGridView({});
        this.tileSelectPopupView = new app.TileSelectPopupView({cityView: this});
        this.buildSelectPopupView = new app.BuildSelectPopupView({cityView: this});
        this.actionSelectPopupView = new app.ActionSelectPopupView({cityView: this});

        this.listenTo(this.model, 'reset', this.render);
        this.listenTo(this.tileSelectPopupView, 'change', this.render);
        this.renderingStopped = false;
        this.hasChanged = false;

        this.setSelectedTurn(this.model.turns.first().cid);
        this.model.recalc();
        this.render();
    },
    render: function() {
        if (this.renderingStopped) {
            this.hasChanged = true; // Needs render eventually.
            return;
        }
        this.$('#speed-checkbox').attr("checked", this.model.get('speed') == 'Quick');
        this.$('#capital-checkbox').attr("checked", this.model.get('isCapital'));
        this.$('#financial-checkbox').attr("checked", this.model.get('isFinancial'));
        this.$('#start-turn-input').val(this.model.get('startTurn'));
        this.$('#rbmod-checkbox').attr("checked", this.model.get('isRBMod'));
        this.addAll();
        this.renderSelectedTurn();
    },
    stopRendering: function(shouldStop) {
        if (shouldStop) {
            this.renderingStopped = true;
        } else {
            this.renderingStopped = false;
            if (this.hasChanged) {
                this.render();
            }
            this.hasChanged = false;
        }
    },
    renderSelectedTurn: function() {
        this.$('tr.info').removeClass('info');
        this.$('tr[data-cid=' + this.selectedTurn + ']').addClass('info');
        this.$('#tile-grid-turn-text').text(this.model.turns.get(this.selectedTurn).get('turn'));
    },
    addOne: function(item) {
        var turnView = new app.CityTurnView({model: item});
        var rendered = turnView.render().el;
        this.$("#city-turns").append(rendered);
    },
    addAll: function() {
        this.$("#city-turns").empty();
        this.model.turns.each(this.addOne, this);
    },
    setSelectedTurn: function(turnCid) {
        this.selectedTurn = turnCid;
        this.tileGridView.setModel(this.model.turns.get(this.selectedTurn));

        this.renderSelectedTurn();
    },
    selectRow: function(e) {
        this.setSelectedTurn($(e.target).closest('tr').attr('data-cid'));
    },
    selectTiles: function(e) {
        var turnCid = $(e.target).closest('tr').attr('data-cid');
        this.tileSelectPopupView.popup(this.model.turns.get(turnCid));
    },
    selectBuild: function(e) {
        var turnCid = $(e.target).closest('tr').attr('data-cid');
        this.buildSelectPopupView.popup(this.model.turns.get(turnCid));
    },
    selectAction: function(e) {
        var turnCid = $(e.target).closest('tr').attr('data-cid');
        this.actionSelectPopupView.popup(this.model.turns.get(turnCid));
    },
    changeCity: function(e) {
        this.stopRendering(true);

        var speedChecked = this.$('#speed-checkbox').is(':checked');
        this.model.setWithRecalc("speed", speedChecked ? "Quick" : "Normal");
        this.model.setWithRecalc("isCapital", this.$('#capital-checkbox').is(':checked'));
        this.model.setWithRecalc("isFinancial", this.$('#financial-checkbox').is(':checked'));
        this.model.setWithRecalc("startTurn", parseInt($('#start-turn-input').val()));
        this.model.setWithRecalc("isRBMod", this.$('#rbmod-checkbox').is(':checked'));

        this.stopRendering(false);
    },
    showUserNoteEdit: function(e) {
        var $tr = $(e.target).closest('tr');
        $tr.find('.user-note').addClass('hidden');
        $tr.find('.user-note-edit').removeClass('hidden').focus();
    },
    hideUserNoteEdit: function(e) {
        var $tr = $(e.target).closest('tr');
        $tr.find('.user-note').removeClass('hidden');
        $tr.find('.user-note-edit').addClass('hidden');
    },
    changeUserNote: function(e) {
        var $tr = $(e.target).closest('tr');
        var val = $(e.target).val();

        $tr.find('.user-note').text(val);
        var turnCid = $tr.attr('data-cid');
        this.model.turns.get(turnCid).set('userNote', val);
    },
    save: function(e) {
        this.model.save($('#city-filename').val().trim());
    },
    load: function(e) {
        this.model.load($('#city-filename').val().trim());
    }
})

$(function() {
    app.city = new app.City();
    app.cityView = new app.CityView({model: app.city});
});